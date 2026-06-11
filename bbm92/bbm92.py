from enum import Enum, auto
import random
from dataclasses import dataclass
from typing import Optional

from sequence.kernel.timeline import Timeline
from sequence.kernel.process import Process
from sequence.kernel.event import Event
from sequence.topology.node import Node
from sequence.protocol import Protocol
from sequence.message import Message
from sequence.components.optical_channel import ClassicalChannel
import sequence.utils.log as log


# Simple in-file storage for trial information
TRIALS = {}


class MsgType(Enum):
    PHOTON = auto()


# --- Hardware-level simple models (in-file) ---


@dataclass
class Photon:
    trial: int
    pair_id: int
    src_bit: int


class EntangledPhotonSource:
    def __init__(self, name: str, tl: Timeline, alice: str, bob: str, num_trials: int, period: int, seed: Optional[int] = None):
        self.name = name
        self.timeline = tl
        self.alice = alice
        self.bob = bob
        self.num_trials = num_trials
        self.period = period
        self.rng = random.Random(seed)
        self.pair_counter = 0

    def start(self):
        for i in range(self.num_trials):
            pair_id = self.pair_counter
            self.pair_counter += 1
            # schedule emission at i*period
            p = Process(self, 'emit', [i, pair_id])
            e = Event(i * self.period, p)
            self.timeline.schedule(e)

    def emit(self, trial: int, pair_id: int):
        # create an entangled pair (both photons share src_bit)
        src_bit = self.rng.randrange(2)
        photon_a = Photon(trial, pair_id, src_bit)
        photon_b = Photon(trial, pair_id, src_bit)
        log.logger.info(f"{self.name} emit pair={pair_id} trial={trial} src_bit={src_bit} time={self.timeline.now()}")
        # deliver via channels registered on nodes (we'll use Node attribute 'outgoing_channels')
        for ch in getattr(self, 'channels', []):
            # each channel knows its destination and whether it's for alice or bob
            ch.transmit(photon_a if ch.dest == self.alice else photon_b, send_time=self.timeline.now(), src=self.name)


class QuantumChannel:
    def __init__(self, name: str, tl: Timeline, delay: int = 1e6, loss: float = 0.0, depolarize: float = 0.0, seed: Optional[int] = None):
        self.name = name
        self.timeline = tl
        self.delay = int(delay)
        self.loss = loss
        self.depolarize = depolarize
        self.rng = random.Random(seed)
        self.src = None
        self.dest = None

    def set_ends(self, src_node: Node, dest_node: Node):
        self.src = src_node
        self.dest = dest_node

    def transmit(self, photon: Photon, send_time: int, src: str):
        # simulate loss
        if self.rng.random() < self.loss:
            log.logger.info(f"{self.name} lost photon pair={photon.pair_id} trial={photon.trial} on channel to {self.dest.name}")
            return

        # simulate depolarization as random flip of bit with probability depolarize
        p = Photon(photon.trial, photon.pair_id, photon.src_bit)
        if self.rng.random() < self.depolarize:
            p.src_bit ^= 1
            log.logger.info(f"{self.name} depolarized photon pair={p.pair_id} trial={p.trial}")

        arrival = send_time + self.delay
        # schedule delivery
        proc = Process(self, 'deliver', [p, src])
        ev = Event(arrival, proc)
        self.timeline.schedule(ev)

    def deliver(self, photon: Photon, src: str):
        # wrap into a Message and deliver to destination node
        msg = Message(MsgType.PHOTON, None)
        msg.payload = {'trial': photon.trial, 'photon': photon}
        # call Node.receive_message with src node name
        self.dest.receive_message(src, msg)


class Detector:
    def __init__(self, name: str, rng_seed: Optional[int] = None):
        self.name = name
        self.rng = random.Random(rng_seed)

    def measure(self, photon: Photon, basis: int) -> int:
        # simple measurement: if basis matches src_bit encoding, return src_bit; otherwise random
        # here we assume src_bit is prepared in Z basis; with mismatch return random
        return photon.src_bit if basis == 0 else self.rng.randrange(2)


class HardwareParticipantProtocol(Protocol):
    def __init__(self, owner: Node, name: str, seed: Optional[int] = None):
        super().__init__(owner, name)
        owner.protocols.append(self)
        self.protocol_type = None
        self.rng = random.Random(seed)
        self.detector = Detector(name + '_det', seed)

    def init(self):
        pass

    def received_message(self, src: str, msg: Message):
        assert msg.msg_type == MsgType.PHOTON
        trial = msg.payload['trial']
        photon = msg.payload.get('photon')
        # choose measurement basis (0:Z, 1:X)
        basis = self.rng.randrange(2)
        role = 'alice' if 'alice' in self.owner.name.lower() else 'bob'

        info = TRIALS.setdefault(trial, {})
        info[f'{role}_basis'] = basis
        info[f'{role}_node'] = self.owner.name
        info[f'{role}_recv_time'] = self.owner.timeline.now()

        # measure using detector
        result = self.detector.measure(photon, basis)
        info[f'{role}_result'] = result
        log.logger.info(f"{self.owner.name} measured trial={trial} basis={basis} result={result} time={self.owner.timeline.now()}")



class SourceProtocol(Protocol):
    def __init__(self, owner: Node, name: str, alice: str, bob: str, num_trials: int, period: int, seed: int = None):
        super().__init__(owner, name)
        owner.protocols.append(self)
        # identify protocol type for message routing (None means generic)
        self.protocol_type = None
        self.alice = alice
        self.bob = bob
        self.num_trials = num_trials
        self.period = period
        self.rng = random.Random(seed)

    def init(self):
        pass

    def start(self):
        for i in range(self.num_trials):
            # schedule emission process for trial i
            p = Process(self, 'emit', [i])
            e = Event(i * self.period, p)
            self.owner.timeline.schedule(e)

    def emit(self, trial: int):
        # create trial entry
        TRIALS[trial] = {'emitted': True}
        # store a hidden random seed bit (not directly revealed)
        TRIALS[trial]['src_bit'] = self.rng.randrange(2)

        # notify Alice and Bob with a PHOTON message
        msg = Message(MsgType.PHOTON, None)
        msg.payload = {'trial': trial}
        self.owner.send_message(self.alice, msg)
        self.owner.send_message(self.bob, msg)
        log.logger.info(f"Source emit trial={trial} src_bit={TRIALS[trial]['src_bit']} time={self.owner.timeline.now()}")

    def received_message(self, src: str, msg: Message):
        # Source does not expect to receive messages in this simple simulation.
        return


class ParticipantProtocol(Protocol):
    def __init__(self, owner: Node, name: str, other_node: str, seed: int = None):
        super().__init__(owner, name)
        owner.protocols.append(self)
        # identify protocol type for message routing (None means generic)
        self.protocol_type = None
        self.other_node = other_node
        self.rng = random.Random(seed)

    def init(self):
        pass

    def received_message(self, src: str, msg: Message):
        assert msg.msg_type == MsgType.PHOTON
        trial = msg.payload['trial']

        # choose measurement basis at reception time (0:Z, 1:X)
        basis = self.rng.randrange(2)
        role = 'alice' if 'alice' in self.owner.name.lower() else 'bob'

        info = TRIALS.setdefault(trial, {})
        info[f'{role}_basis'] = basis
        info[f'{role}_node'] = self.owner.name
        info[f'{role}_recv_time'] = self.owner.timeline.now()

        log.logger.info(f"{self.owner.name} received trial={trial} basis={basis} time={self.owner.timeline.now()}")

        # if both parties have set their basis, compute correlated outcomes
        if 'alice_basis' in info and 'bob_basis' in info and 'alice_result' not in info:
            # if bases equal -> correlated outcome; else -> independent random
            if info['alice_basis'] == info['bob_basis']:
                v = self.rng.randrange(2)
                info['alice_result'] = v
                info['bob_result'] = v
            else:
                info['alice_result'] = self.rng.randrange(2)
                info['bob_result'] = self.rng.randrange(2)

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

def start():
    # Simulation parameters
    NUM_TRIALS = 200
    FREQUENCY = 100  # Hz

    tl = Timeline()

    # logging
    log_filename = 'bbm92.log'
    log.set_logger(__name__, tl, log_filename)
    log.set_logger_level('INFO')
    log.track_module('bbm92')

    # nodes
    source = Node('source', tl)
    alice = Node('alice', tl)
    bob = Node('bob', tl)

    # channels (classical) for messages
    cc_sa = ClassicalChannel('cc_source_alice', tl, 1e3)
    cc_sb = ClassicalChannel('cc_source_bob', tl, 1e3)
    cc_sa.set_ends(source, alice.name)
    cc_sb.set_ends(source, bob.name)

    # attach protocols
    period = int(1e12 / FREQUENCY)
    srcp = SourceProtocol(source, 'srcp', 'alice', 'bob', NUM_TRIALS, period, seed=random.randint(0, 1e3))
    alicexp = ParticipantProtocol(alice, 'alicexp', 'source', seed=random.randint(0, 1e3))
    bobp = ParticipantProtocol(bob, 'bobp', 'source', seed=random.randint(0, 1e3))

    # schedule source start at time 0
    p = Process(srcp, 'start', [])
    e = Event(0, p)
    tl.schedule(e)

    tl.init()
    srcp.start()
    tl.run()

    # After run, perform sifting
    key_a = []
    key_b = []
    for i in range(NUM_TRIALS):
        info = TRIALS.get(i, {})
        if info.get('alice_basis') is None or info.get('bob_basis') is None:
            continue
        if info['alice_basis'] == info['bob_basis']:
            # keep the bit
            key_a.append(info.get('alice_result', None))
            key_b.append(info.get('bob_result', None))

    # compute agreement
    total = len(key_a)

    if total == 0:
        print('No sifted bits.')
        log.logger.info('No sifted bits.')
    else:
        agree = sum(1 for x, y in zip(key_a, key_b) if x == y)
        print(f'Total trials: {NUM_TRIALS}')
        print(f'Sifted key length: {total}')
        print(f'Agreement: {agree}/{total} ({100*agree/total:.2f}%)')
        log.logger.info(f'Total trials: {NUM_TRIALS} Sifted: {total} Agreement: {agree}/{total} ({100*agree/total:.2f}%)')

    key_alice = ''.join(str(bit) for bit in key_a)
    key_bob = ''.join(str(bit) for bit in key_b)

    log.logger.info("Key Alice: %s", key_alice)
    log.logger.info("Key Length: %d", len(key_alice))
    log.logger.info("Key Bob: %s", key_bob)
    log.logger.info("Key Length: %d", len(key_bob))
    qber = calculate_qber(key_a, key_b)
    print(f"Estimated QBER: {qber*100:.2f}%")
    log.logger.info(f"Estimated QBER: {qber*100:.2f}%")


def start_hardware():
    # Hardware-like simulation parameters
    NUM_TRIALS = 200
    FREQUENCY = 100  # Hz

    tl = Timeline()

    # logging
    log_filename = 'bbm92_hw.log'
    log.set_logger(__name__, tl, log_filename)
    log.set_logger_level('INFO')
    log.track_module('bbm92_hw')

    # nodes
    source_node = Node('hw_source', tl)
    alice = Node('hw_alice', tl)
    bob = Node('hw_bob', tl)

    # channels (quantum) with loss and depolarization
    qch_a = QuantumChannel('qch_source_alice', tl, delay=1e5, loss=0.05, depolarize=0.02, seed=10)
    qch_b = QuantumChannel('qch_source_bob', tl, delay=1e5, loss=0.05, depolarize=0.02, seed=11)
    qch_a.set_ends(source_node, alice)
    qch_b.set_ends(source_node, bob)

    # register channels on source so it can broadcast
    src = EntangledPhotonSource('ent_src', tl, alice.name, bob.name, NUM_TRIALS, int(1e12 / FREQUENCY), seed=0)
    src.channels = [qch_a, qch_b]

    # attach hardware participant protocols
    al_proto = HardwareParticipantProtocol(alice, 'alice_hw_proto', seed=1)
    bob_proto = HardwareParticipantProtocol(bob, 'bob_hw_proto', seed=2)

    # schedule source start
    p = Process(src, 'start', [])
    e = Event(0, p)
    tl.schedule(e)

    tl.init()
    src.start()
    tl.run()

    # sifting
    key_a = []
    key_b = []
    for i in range(NUM_TRIALS):
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
        print(f'[hardware] Total trials: {NUM_TRIALS}')
        print(f'[hardware] Sifted key length: {total}')
        print(f'[hardware] Agreement: {agree}/{total} ({100*agree/total:.2f}%)')
        log.logger.info(f'[hardware] Total trials: {NUM_TRIALS} Sifted: {total} Agreement: {agree}/{total} ({100*agree/total:.2f}%)')

if __name__ == "__main__":
    # Run the hardware-mode simulation once by default
    print("--- Hardware-mode run ---")
    start_hardware()
