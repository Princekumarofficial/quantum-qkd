from enum import Enum, auto
import random
from math import sqrt as msqrt
from typing import Optional
from sequence.components.photon import Photon
from sequence.components.detector import QSDetectorPolarization
from sequence.components.light_source import SPDCSource
from sequence.utils.encoding import polarization

from sequence.kernel.timeline import Timeline
from sequence.kernel.process import Process
from sequence.kernel.event import Event
from sequence.topology.node import Node
from sequence.kernel.entity import Entity
from sequence.protocol import Protocol
from sequence.message import Message
from sequence.components.optical_channel import ClassicalChannel, QuantumChannel
import sequence.utils.log as log


# Simple in-file storage for trial information
TRIALS = {}


class MsgType(Enum):
    PHOTON = auto()
    CLASSICAL = auto()

class TaggedSPDCSource(SPDCSource):
    """SPDCSource subclass that:
    1. Stamps a monotonically-increasing trial index on every emitted photon pair
       so HardwareParticipantProtocol can key TRIALS by trial number.
    2. Routes each photon through a real QuantumChannel (via owner.send_qubit)
       so attenuation and polarization noise are applied, producing non-zero QBER.
       Without this, SPDCSource.send_photons delivers photons directly to receivers,
       bypassing the channel entirely.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._trial_index = 0
        # set by start_hardware: (qch_to_alice, qch_to_bob)
        self.channels: tuple = (None, None)

    def send_photons(self, time, photons):
        """Tag photons with trial index, then send through QuantumChannels."""
        trial = self._trial_index
        self._trial_index += 1
        for ph in photons:
            ph.trial = trial
            ph.pair_id = trial

        ph_alice, ph_bob = photons
        qch_a, qch_b = self.channels

        # Route through the quantum channels: applies loss + polarization noise.
        # owner.send_qubit(dst_name, photon) calls qch.transmit(photon, owner)
        # which schedules delivery to dst_node.receive_qubit -> first_component.get()
        process_a = Process(self.owner, 'send_qubit', [qch_a.receiver, ph_alice])
        process_b = Process(self.owner, 'send_qubit', [qch_b.receiver, ph_bob])
        self.timeline.schedule(Event(int(round(time)), process_a))
        self.timeline.schedule(Event(int(round(time)), process_b))


class HardwareParticipantProtocol(Protocol):
    def __init__(self, owner: Node, name: str, seed: Optional[int] = None):
        super().__init__(owner, name)
        owner.protocols.append(self)
        self.protocol_type = None
        self.rng = random.Random(seed)
        self.qsdet = QSDetectorPolarization(owner.name + '.qsdet', owner.timeline)
        owner.add_component(self.qsdet)
        self.qsdet.init()

        # add a small tapping component that informs this protocol when a photon arrives
        class PhotonTap(Entity):
            def __init__(self, name: str, timeline: Timeline, proto: HardwareParticipantProtocol, detector: QSDetectorPolarization):
                super().__init__(name, timeline)
                self.proto = proto
                self.detector = detector

            def init(self):
                pass

            def get(self, photon, **kwargs):
                # inform protocol about incoming photon via a Message so it can record basis/result
                msg = Message(MsgType.PHOTON, None)
                msg.payload = {'trial': getattr(photon, 'trial', None), 'photon': photon}
                try:
                    # call protocol handler (same API as receive_message)
                    self.proto.received_message(self.owner.name, msg)
                except Exception:
                    pass
                # forward photon to detector for hardware modelling
                try:
                    self.detector.get(photon)
                except Exception:
                    pass

        tap = PhotonTap(owner.name + '.tap', owner.timeline, self, self.qsdet)
        owner.add_component(tap)
        owner.set_first_component(tap.name)

    def init(self):
        pass

    def received_message(self, src: str, msg: Message):
        if msg.msg_type != MsgType.PHOTON:
            return
        trial = msg.payload['trial']
        photon = msg.payload.get('photon')
        # choose measurement basis (0:Z, 1:X)
        basis = self.rng.randrange(2)
        role = 'alice' if 'alice' in self.owner.name.lower() else 'bob'

        info = TRIALS.setdefault(trial, {})
        info[f'{role}_basis'] = basis
        info[f'{role}_node'] = self.owner.name
        info[f'{role}_recv_time'] = self.owner.timeline.now()

        # forward photon to hardware detector model (schedules internal detection events)
        try:
            self.qsdet.get(photon, src=src)
        except Exception:
            log.logger.debug(f"QSDetector get failed for {self.owner.name} trial={trial}")

        # perform logical measurement using Photon.measure for immediate outcome
        basis_mat = polarization['bases'][basis]
        try:
            result = Photon.measure(basis_mat, photon, self.rng)
        except Exception:
            # fallback: no detection
            result = None

        if result is not None:
            info[f'{role}_result'] = result
        log.logger.info(f"{self.owner.name} measured trial={trial} basis={basis} result={result} time={self.owner.timeline.now()}")


class SiftingProtocol(Protocol):
    def __init__(self, owner: Node, name: str, other: str):
        super().__init__(owner, name)
        owner.protocols.append(self)
        self.protocol_type = None
        self.other = other

    def init(self):
        pass

    def send_bases(self):
        # collect bases from TRIALS for this owner
        bases = {}
        for trial, info in TRIALS.items():
            role = 'alice' if 'alice' in self.owner.name.lower() else 'bob'
            b = info.get(f"{role}_basis")
            res = info.get(f"{role}_result")
            if b is not None and res is not None:
                bases[trial] = b

        msg = Message(MsgType.CLASSICAL, None)
        msg.payload = {'type': 'bases', 'bases': bases}
        # send to other
        self.owner.send_message(self.other, msg)
        log.logger.info(f"{self.owner.name} sent bases to {self.other} count={len(bases)} time={self.owner.timeline.now()}")

    def received_message(self, src: str, msg: Message):
        if msg.msg_type != MsgType.CLASSICAL:
            return
        payload = msg.payload
        if payload.get('type') != 'bases':
            return
        their_bases = payload.get('bases', {})
        # perform sifting using own recorded bases/results
        role = 'bob' if 'bob' in self.owner.name.lower() else 'alice'
        key_self = []
        key_other = []
        for trial, their_b in their_bases.items():
            info = TRIALS.get(trial, {})
            my_b = info.get(f"{role}_basis")
            my_res = info.get(f"{role}_result")
            if my_b is None or my_res is None:
                continue
            if my_b == their_b:
                # keep bits
                a = info.get('alice_result')
                b = info.get('bob_result')
                if a is not None and b is not None:
                    key_self.append(a if role == 'alice' else b)
                    key_other.append(b if role == 'alice' else a)

        # store sifting result in TRIALS summary
        log.logger.info(f"{self.owner.name} sifted key length={len(key_self)}")
        print(f'[{self.owner.name}] Sifted length: {len(key_self)}')


def calculate_qber(key_a, key_b, percent_key=15):
    if len(key_a) != len(key_b):
        raise ValueError("Keys must be of the same length to calculate QBER.")
    total = len(key_a)
    if total == 0:
        return 0.0
    sample_size = max(1, int(total * percent_key / 100))
    sample_indices = random.sample(range(total), sample_size)
    errors = sum(1 for i in sample_indices if key_a[i] != key_b[i])
    return errors / sample_size

def show_keys(key_a, key_b):
    print("Alice's key:", ''.join(str(bit) for bit in key_a))
    print("Bob's key:  ", ''.join(str(bit) for bit in key_b))

def start_hardware():
    # Hardware-like simulation parameters
    NUM_TRIALS = 100
    FREQUENCY = 100  # Hz

    period = int(1e12 / FREQUENCY)

    tl = Timeline()

    # logging
    log_filename = 'bbm92.log'
    log.set_logger(__name__, tl, log_filename)
    log.set_logger_level('INFO')
    log.track_module('bbm92')

    # nodes
    source_node = Node('source', tl)
    alice = Node('alice', tl)
    bob = Node('bob', tl)

    attenuation = 0.0002   # dB/m  (~2 dB over 1 km -> ~37% loss)
    distance    = 1000.0   # m
    pol_fidelity = 0.93    # 7% chance of polarization flip per photon -> raises QBER
    qch_a = QuantumChannel('qch_source_alice', tl, attenuation, distance,
                           pol_fidelity, frequency=FREQUENCY)
    qch_b = QuantumChannel('qch_source_bob',   tl, attenuation, distance,
                           pol_fidelity, frequency=FREQUENCY)
    qch_a.set_ends(source_node, alice.name)
    qch_b.set_ends(source_node, bob.name)

    # TaggedSPDCSource stamps photon.trial on every pair so TRIALS can be keyed
    # by trial index (0..NUM_TRIALS-1).  mean_photon_num >> 1 so Poisson rarely
    # drops a trial entirely (P(0)=e^-10 ≈ 0).
    src = TaggedSPDCSource('ent_src', tl, frequency=FREQUENCY, mean_photon_num=10,
                           encoding_type=polarization)
    src.owner = source_node
    source_node.add_component(src)
    # Inject channels so send_photons can route through them.
    src.channels = (qch_a, qch_b)

    # attach hardware participant protocols (also installs PhotonTap on each node)
    _al_proto = HardwareParticipantProtocol(alice, 'alice_proto', seed=random.randint(0, 1000))
    _bob_proto = HardwareParticipantProtocol(bob, 'bob_proto', seed=random.randint(0, 1000))

    # SPDCSource._receivers are no longer used for delivery (send_photons overrides
    # routing), but add_receiver is still required for SPDCSource.init() assert.
    src.add_receiver(alice.components[alice.first_component_name])
    src.add_receiver(bob.components[bob.first_component_name])

    # classical channel for sifting (Alice -> Bob)
    cc_ab = ClassicalChannel('cc_alice_bob', tl, 1e3)
    cc_ab.set_ends(alice, bob.name)

    # attach sifting protocols
    sift_alice = SiftingProtocol(alice, 'sift_alice', bob.name)
    sift_bob = SiftingProtocol(bob, 'sift_bob', alice.name)

    tl.init()

    # SPDCSource.emit() schedules all pair emissions internally at 1/FREQUENCY intervals.
    # For polarization encoding it reads state[0] and state[1] as Bell-state amplitudes:
    #   set_state((state[0], 0, 0, state[1])) -> Phi+ = (|HH> + |VV>) / sqrt(2)
    _bell_amp = msqrt(0.5)
    src.emit([(complex(_bell_amp), complex(_bell_amp))] * NUM_TRIALS)

    # schedule sifting after all transmissions complete
    sifting_time = NUM_TRIALS * period + int(period // 2)
    ps = Process(sift_alice, 'send_bases', [])
    es = Event(sifting_time, ps)
    tl.schedule(es)

    tl.run()

    # sifting
    key_a = []
    key_b = []
    for i in TRIALS.keys():
        info = TRIALS.get(i, {})
        if info.get('alice_basis') is None or info.get('bob_basis') is None:
            continue
        if info['alice_basis'] == info['bob_basis']:
            key_a.append(info.get('alice_result', None))
            key_b.append(info.get('bob_result', None))

    total = len(key_a)
    if total == 0:
        print('No sifted bits (hardware).')
        log.logger.info('No sifted bits (hardware).')
    else:
        agree = sum(1 for x, y in zip(key_a, key_b) if x == y)
        print(f'Total trials: {NUM_TRIALS}')
        print(f'Sifted key length: {total}')
        print(f'Agreement: {agree}/{total} ({100*agree/total:.2f}%)')
        qber = calculate_qber(key_a, key_b)
        print(f'Estimated QBER: {qber*100:.2f}%')
        log.logger.info(f'Total trials: {NUM_TRIALS} Sifted: {total} Agreement: {agree}/{total} ({100*agree/total:.2f}%)')
        show_keys(key_a, key_b)

if __name__ == "__main__":
    # Run the hardware-mode simulation once by default
    print("--- Hardware-mode run ---")
    start_hardware()
