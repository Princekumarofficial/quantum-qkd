import os
import sys
import random
from math import sqrt as msqrt
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ensure workspace folders are in Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import sequence components
from sequence.kernel.timeline import Timeline
from sequence.kernel.process import Process
from sequence.kernel.event import Event
from sequence.topology.node import Node
from sequence.kernel.entity import Entity
from sequence.protocol import Protocol
from sequence.message import Message
from sequence.components.photon import Photon
from sequence.components.detector import QSDetectorPolarization
from sequence.components.light_source import SPDCSource
from sequence.components.optical_channel import ClassicalChannel, QuantumChannel
from sequence.utils.encoding import polarization

app = FastAPI(title="SeQUeNCe QKD simulation backend")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Models
class ComponentConfig(BaseModel):
    id: str
    name: str
    type: str
    efficiency: Optional[float] = 0.95
    dark_count: Optional[float] = 1e-6
    mean_photon_num: Optional[float] = 10.0
    frequency: Optional[int] = 100

class NodeConfig(BaseModel):
    id: str
    name: str
    type: str
    components: List[ComponentConfig]

class ChannelConfig(BaseModel):
    id: str
    name: str
    type: str
    src: str
    dst: str
    distance: Optional[float] = 1000.0
    attenuation: Optional[float] = 0.0002
    fidelity: Optional[float] = 0.95
    delay: Optional[float] = 1e-6

class SimulationConfig(BaseModel):
    numTrials: int
    nodes: List[NodeConfig]
    channels: List[ChannelConfig]

# Custom Simulation classes to collect data from SeQUeNCe execution
SIMULATION_TRIALS = {}

class TrackedSPDCSource(SPDCSource):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._trial_index = 0
        self.channels = (None, None)

    def send_photons(self, time, photons):
        trial = self._trial_index
        self._trial_index += 1
        for ph in photons:
            ph.trial = trial
            ph.pair_id = trial

        ph_alice, ph_bob = photons
        qch_a, qch_b = self.channels

        if qch_a and qch_b:
            process_a = Process(self.owner, 'send_qubit', [qch_a.receiver, ph_alice])
            process_b = Process(self.owner, 'send_qubit', [qch_b.receiver, ph_bob])
            self.timeline.schedule(Event(int(round(time)), process_a))
            self.timeline.schedule(Event(int(round(time)), process_b))


class SimParticipantProtocol(Protocol):
    def __init__(self, owner: Node, name: str, seed: int):
        super().__init__(owner, name)
        owner.protocols.append(self)
        self.rng = random.Random(seed)
        self.qsdet = QSDetectorPolarization(owner.name + '.qsdet', owner.timeline)
        owner.add_component(self.qsdet)
        self.qsdet.init()

        class PhotonTap(Entity):
            def __init__(self, name: str, timeline: Timeline, proto: SimParticipantProtocol, detector: QSDetectorPolarization):
                super().__init__(name, timeline)
                self.proto = proto
                self.detector = detector

            def init(self):
                pass

            def get(self, photon, **kwargs):
                msg = Message(1, None)
                msg.payload = {'trial': getattr(photon, 'trial', None), 'photon': photon}
                try:
                    self.proto.received_message(self.owner.name, msg)
                except Exception:
                    pass
                try:
                    self.detector.get(photon)
                except Exception:
                    pass

        tap = PhotonTap(owner.name + '.tap', owner.timeline, self, self.qsdet)
        owner.add_component(tap)
        owner.set_first_component(tap.name)

    def received_message(self, src: str, msg: Message):
        trial = msg.payload['trial']
        photon = msg.payload.get('photon')
        basis = self.rng.randrange(2)
        role = 'alice' if 'alice' in self.owner.name.lower() else 'bob'

        info = SIMULATION_TRIALS.setdefault(trial, {})
        info[f'{role}_basis'] = basis
        info[f'{role}_node'] = self.owner.name

        # Call detector to collapse state synchronously
        try:
            self.qsdet.get(photon, src=src)
        except Exception:
            pass

        basis_mat = polarization['bases'][basis]
        
        try:
            res = Photon.measure(basis_mat, photon, self.rng)
        except Exception:
            res = self.rng.randrange(2)

        info[f'{role}_result'] = res


class SimBSMProtocol(Protocol):
    def __init__(self, owner: Node, name: str, seed: int):
        super().__init__(owner, name)
        owner.protocols.append(self)
        self.rng = random.Random(seed)
        
        class PhotonTapBSM(Entity):
            def __init__(self, name: str, timeline: Timeline, proto):
                super().__init__(name, timeline)
                self.proto = proto

            def init(self): pass

            def get(self, photon, **kwargs):
                msg = Message(1, None)
                msg.payload = {'trial': getattr(photon, 'trial', None), 'photon': photon}
                try:
                    self.proto.received_message(self.owner.name, msg)
                except Exception:
                    pass

        self.tap = PhotonTapBSM(owner.name + '.tap', owner.timeline, self)
        owner.add_component(self.tap)
        owner.set_first_component(self.tap.name)

    def received_message(self, src: str, msg: Message):
        trial = msg.payload['trial']
        info = SIMULATION_TRIALS.setdefault(trial, {})
        
        count = info.get('bsm_photon_count', 0)
        info['bsm_photon_count'] = count + 1
        
        # Bell state measurement requires 2 photons
        if info['bsm_photon_count'] == 2:
            # 0: Phi+, 1: Phi-, 2: Psi+, 3: Psi-
            bell_state = self.rng.randrange(4)
            info['bsm_result'] = bell_state


@app.post("/api/simulate")
def run_simulation(config: SimulationConfig):
    global SIMULATION_TRIALS
    SIMULATION_TRIALS.clear()

    try:
        # Create timeline
        tl = Timeline()
        frequency = 100
        period = int(1e12 / frequency)

        # 1. Create nodes dynamically
        nodes_map = {}
        for n_conf in config.nodes:
            node = Node(n_conf.id, tl)
            nodes_map[n_conf.id] = node

        # Find sources and endpoints
        sources = [n for n in config.nodes if n.type == "source"]
        endpoints = [n for n in config.nodes if n.type == "endpoint"]
        transceivers = [n for n in config.nodes if n.type == "transceiver"]

        if not sources or not endpoints:
            raise HTTPException(status_code=400, detail="Topology must contain at least one source and endpoints.")

        # Configure endpoints
        for ep in endpoints:
            node = nodes_map[ep.id]
            # Attach hardware participant protocol
            SimParticipantProtocol(node, f"{ep.id}_proto", seed=random.randint(0, 1000))

        # Setup transceivers as endpoint listeners too
        for tr in transceivers:
            node = nodes_map[tr.id]
            SimParticipantProtocol(node, f"{tr.id}_proto", seed=random.randint(0, 1000))
            
        # Setup BSM nodes
        bsms = [n for n in config.nodes if n.type == "bsm"]
        for bsm in bsms:
            node = nodes_map[bsm.id]
            SimBSMProtocol(node, f"{bsm.id}_proto", seed=random.randint(0, 1000))

        # Configure sources
        sources_list = []
        for src_conf in sources:
            node = nodes_map[src_conf.id]
            spdc_conf = next((c for c in src_conf.components if c.type == "SPDCSource"), None)
            mean_photons = spdc_conf.mean_photon_num if spdc_conf else 10.0
            
            src = TrackedSPDCSource(
                f"{src_conf.id}_src", tl, 
                frequency=frequency, 
                mean_photon_num=mean_photons, 
                encoding_type=polarization
            )
            src.owner = node
            node.add_component(src)
            sources_list.append((src_conf.id, src))

        # 2. Add Channels
        qch_list = []
        for ch in config.channels:
            if ch.type == "quantum":
                # Only connect if both ends exist
                if ch.src in nodes_map and ch.dst in nodes_map:
                    qch = QuantumChannel(
                        ch.id, tl, 
                        attenuation=ch.attenuation, 
                        distance=ch.distance, 
                        polarization_fidelity=ch.fidelity,
                        frequency=frequency
                    )
                    qch.set_ends(nodes_map[ch.src], ch.dst)
                    qch_list.append(qch)
            else:
                if ch.src in nodes_map and ch.dst in nodes_map:
                    cc = ClassicalChannel(ch.id, tl, distance=ch.distance, delay=ch.delay)
                    cc.set_ends(nodes_map[ch.src], ch.dst)

        # Connect SPDC channels dynamically based on routing
        for src_id, src_obj in sources_list:
            src_channels = [qch for qch in qch_list if qch.sender.name == src_id]
            # Bind up to 2 quantum channels to the source
            if len(src_channels) > 0:
                src_obj.channels = tuple(src_channels[:2])
                for ch in src_channels[:2]:
                    recv_node = nodes_map[ch.receiver]
                    # Find receiver tap component name
                    comp_name = recv_node.first_component_name if hasattr(recv_node, 'first_component_name') else list(recv_node.components.keys())[0]
                    src_obj.add_receiver(recv_node.components[comp_name])

        # 3. Schedule and run simulation
        tl.init()
        _bell_amp = msqrt(0.5)
        for _, src_obj in sources_list:
            src_obj.emit([(complex(_bell_amp), complex(_bell_amp))] * config.numTrials)

        tl.run()

        # 4. Process and format sifting results
        sim_logs = []
        trials_result = []
        sifted_alice = []
        sifted_bob = []
        errors = 0

        sim_logs.append("Initializing SeQUeNCe Timeline.")
        sim_logs.append("Quantum and Classical nodes registered.")
        sim_logs.append("Beginning entangled photon pair distribution.")

        for i in range(config.numTrials):
            info = SIMULATION_TRIALS.get(i, {})
            alice_b = info.get("alice_basis")
            bob_b = info.get("bob_basis")
            alice_r = info.get("alice_result")
            bob_r = info.get("bob_result")
            
            survived_a = alice_r is not None
            survived_b = bob_r is not None

            # Check BSM status for entanglement swapping
            has_bsm = any(n.type == "bsm" for n in config.nodes)
            bsm_success = False
            if has_bsm:
                if info.get('bsm_photon_count', 0) == 2 and 'bsm_result' in info:
                    bsm_success = True
                    # Entanglement swapping logic:
                    # In a real setup, Alice and Bob apply Pauli operations based on BSM result.
                    # Since we are emulating, we can enforce Bob's bit flip if BSM result is Phi- or Psi-
                    if info['bsm_result'] in [1, 3] and bob_r is not None:
                        bob_r = 1 - bob_r
                else:
                    # BSM failed to receive both photons, trial fails
                    sim_logs.append(f"Trial {i+1}: Failed (BSM photon loss).")
                    continue

            trials_result.append({
                "trial": i,
                "alice_basis": alice_b if survived_a else random.randint(0, 1),
                "bob_basis": bob_b if survived_b else random.randint(0, 1),
                "alice_result": alice_r,
                "bob_result": bob_r,
                "lossA": not survived_a,
                "lossB": not survived_b,
                "bsm": bsm_success
            })

            if survived_a and survived_b:
                if alice_b == bob_b:
                    sifted_alice.append(alice_r)
                    sifted_bob.append(bob_r)
                    if alice_r != bob_r:
                        errors += 1

        total_sifted = len(sifted_alice)
        qber = (errors / total_sifted * 100) if total_sifted > 0 else 0.0

        sim_logs.append(f"Simulation completed. Total trials: {config.numTrials}")
        sim_logs.append(f"Sifted key length: {total_sifted}")
        sim_logs.append(f"QBER: {qber:.2f}%")

        return {
            "trials": trials_result,
            "logs": sim_logs,
            "siftedKeyAlice": "".join(str(bit) for bit in sifted_alice),
            "siftedKeyBob": "".join(str(bit) for bit in sifted_bob),
            "qber": qber
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
