import os
import sys
import random
from math import sqrt as msqrt
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

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
from sequence.topology.node import BSMNode
from sequence.components.memory import MemoryArray
from sequence.resource_management.resource_manager import ResourceManager
from sequence.resource_management.memory_manager import MemoryManager, MemoryInfo
from sequence.resource_management.rule_manager import RuleManager, Rule
from sequence.entanglement_management.generation import EntanglementGenerationA
from sequence.entanglement_management.swapping import EntanglementSwappingA, EntanglementSwappingB

app = FastAPI(title="ChaQra — Quantum Network Simulator Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request Models ────────────────────────────────────────────────────────────

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

class SelectedPair(BaseModel):
    alice: Optional[str] = None
    bob: Optional[str] = None

class SimulationConfig(BaseModel):
    numTrials: int
    nodes: List[NodeConfig]
    channels: List[ChannelConfig]
    selectedPair: Optional[SelectedPair] = None

# ─── Shared Simulation State ───────────────────────────────────────────────────
SIMULATION_TRIALS: Dict[int, Dict] = {}

# ─── SeQUeNCe Protocol Classes ────────────────────────────────────────────────

class TrackedSPDCSource(SPDCSource):
    """SPDC source that stamps photons with trial index for tracking."""
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
            self.timeline.schedule(Event(int(round(time)), Process(self.owner, 'send_qubit', [qch_a.receiver, ph_alice])))
            self.timeline.schedule(Event(int(round(time)), Process(self.owner, 'send_qubit', [qch_b.receiver, ph_bob])))


class SimParticipantProtocol(Protocol):
    """Measurement protocol for any endpoint or repeater node.
    
    Stores results keyed by node ID so the post-processor can look up any node pair.
    """
    def __init__(self, owner: Node, name: str, seed: int):
        super().__init__(owner, name)
        owner.protocols.append(self)
        self.rng = random.Random(seed)
        self.node_id = owner.name  # Use actual node ID

        self.qsdet = QSDetectorPolarization(owner.name + '.qsdet', owner.timeline)
        owner.add_component(self.qsdet)
        self.qsdet.init()

        proto_ref = self

        class PhotonTap(Entity):
            def __init__(self, name, timeline):
                super().__init__(name, timeline)
            def init(self): pass
            def get(self, photon, **kwargs):
                msg = Message(1, None)
                msg.payload = {'trial': getattr(photon, 'trial', None), 'photon': photon}
                try:
                    proto_ref.received_message(self.owner.name, msg)
                except Exception:
                    pass
                try:
                    proto_ref.qsdet.get(photon)
                except Exception:
                    pass

        tap = PhotonTap(owner.name + '.tap', owner.timeline)
        owner.add_component(tap)
        owner.set_first_component(tap.name)

    def received_message(self, src: str, msg: Message):
        trial = msg.payload.get('trial')
        photon = msg.payload.get('photon')
        if trial is None:
            return

        basis = self.rng.randrange(2)
        info = SIMULATION_TRIALS.setdefault(trial, {})

        # Store by node ID (not role) — supports any alice/bob selection
        info[f'{self.node_id}_basis'] = basis
        info[f'{self.node_id}_node'] = self.node_id

        try:
            self.qsdet.get(photon, src=src)
        except Exception:
            pass

        basis_mat = polarization['bases'][basis]
        try:
            res = Photon.measure(basis_mat, photon, self.rng)
        except Exception:
            res = self.rng.randrange(2)

        info[f'{self.node_id}_result'] = res


class SimBSMProtocol(Protocol):
    """Bell State Measurement protocol for BSM-type nodes."""
    def __init__(self, owner: Node, name: str, seed: int):
        super().__init__(owner, name)
        owner.protocols.append(self)
        self.rng = random.Random(seed)
        proto_ref = self

        class PhotonTapBSM(Entity):
            def __init__(self, name, timeline):
                super().__init__(name, timeline)
            def init(self): pass
            def get(self, photon, **kwargs):
                msg = Message(1, None)
                msg.payload = {'trial': getattr(photon, 'trial', None), 'photon': photon}
                try:
                    proto_ref.received_message(self.owner.name, msg)
                except Exception:
                    pass

        tap = PhotonTapBSM(owner.name + '.tap', owner.timeline)
        owner.add_component(tap)
        owner.set_first_component(tap.name)

    def received_message(self, src: str, msg: Message):
        trial = msg.payload.get('trial')
        if trial is None:
            return
        info = SIMULATION_TRIALS.setdefault(trial, {})
        count = info.get('bsm_photon_count', 0)
        info['bsm_photon_count'] = count + 1
        if info['bsm_photon_count'] == 2:
            info['bsm_result'] = self.rng.randrange(4)  # 0=Φ+ 1=Φ- 2=Ψ+ 3=Ψ-


# ─── Pure Python Multi-hop Physics Simulation ─────────────────────────────────

def _find_path_bfs(start_id: str, end_id: str, channels: List[ChannelConfig]) -> Optional[List[str]]:
    """BFS path finder on the quantum channel graph."""
    adj: Dict[str, List[str]] = {}
    for ch in channels:
        if ch.type == 'quantum':
            adj.setdefault(ch.src, []).append(ch.dst)
            adj.setdefault(ch.dst, []).append(ch.src)

    visited = {start_id}
    queue = [(start_id, [start_id])]
    while queue:
        curr, path = queue.pop(0)
        if curr == end_id:
            return path
        for nxt in adj.get(curr, []):
            if nxt not in visited:
                visited.add(nxt)
                queue.append((nxt, path + [nxt]))
    return None


def _simulate_chain(path: List[str], channels: List[ChannelConfig], rng: random.Random):
    # Backward compatibility stub
    pass

class QKDRouterNode(Node):
    def __init__(self, name: str, timeline: Timeline, num_memories: int = 10):
        super().__init__(name, timeline)
        self.memory_array = MemoryArray(f"{name}_mem", timeline, num_memories=num_memories)
        self.add_component(self.memory_array)
        
        self.resource_manager = ResourceManager(self)
        self.memory_manager = MemoryManager(self.memory_array)
        self.rule_manager = RuleManager()
        
        self.resource_manager.load_manager(self.memory_manager)
        self.resource_manager.load_manager(self.rule_manager)
        self.memory_manager.set_resource_manager(self.resource_manager)
        self.rule_manager.set_resource_manager(self.resource_manager)

def create_entanglement_generation_rule(node: QKDRouterNode, other_node_name: str, bsm_name: str) -> Rule:
    def req_func(protocols): return True
    def condition(memory_info: MemoryInfo, manager: MemoryManager):
        return memory_info.state == "RAW"
    def action(memory_info: MemoryInfo, manager: MemoryManager):
        proto = EntanglementGenerationA(None, f"{node.name}_eg_{other_node_name}", bsm_name, node, other_node_name, memory_info.memory)
        return [proto]
    return Rule(10, action, condition, req_func)

def create_entanglement_swapping_rule_a(node: QKDRouterNode, left_node: str, right_node: str) -> Rule:
    def req_func(protocols):
        for proto in protocols:
            if isinstance(proto, EntanglementSwappingA): return True
        return False
    def condition(memory_info: MemoryInfo, manager: MemoryManager):
        return memory_info.state == "ENTANGLED" and memory_info.remote_node in [left_node, right_node]
    def action(memory_info: MemoryInfo, manager: MemoryManager):
        target_node = right_node if memory_info.remote_node == left_node else left_node
        other_info = next((info for info in manager if info.state == "ENTANGLED" and info.remote_node == target_node), None)
        if not other_info: return []
        left_memo = memory_info.memory if memory_info.remote_node == left_node else other_info.memory
        right_memo = other_info.memory if memory_info.remote_node == left_node else memory_info.memory
        proto = EntanglementSwappingA(node, f"{node.name}_swap_{left_node}_{right_node}", left_memo, right_memo)
        return [proto]
    return Rule(10, action, condition, req_func)

def create_entanglement_swapping_rule_b(node: QKDRouterNode, hold_node: str) -> Rule:
    def req_func(protocols):
        for p in protocols:
            if isinstance(p, EntanglementSwappingB): return True
        return False
    def condition(memory_info: MemoryInfo, manager: MemoryManager):
        return memory_info.state == "ENTANGLED" and memory_info.remote_node == hold_node
    def action(memory_info: MemoryInfo, manager: MemoryManager):
        proto = EntanglementSwappingB(node, f"{node.name}_swapb_{hold_node}", memory_info.memory)
        return [proto]
    return Rule(10, action, condition, req_func)

def _build_sequence_topology(path: List[str], config: SimulationConfig, tl: Timeline):
    # Constructs the required multihop topology map
    nodes = {}
    for node_name in path:
        nodes[node_name] = QKDRouterNode(node_name, tl, num_memories=10)
    return nodes

def _run_sequence_multihop(alice_path: List[str], bob_path: List[str], config: SimulationConfig, num_trials: int) -> List[Dict]:
    rng = random.Random()
    results = []
    
    ch_map = {}
    for ch in config.channels:
        if ch.type == 'quantum':
            ch_map[f"{ch.src}_{ch.dst}"] = ch
            ch_map[f"{ch.dst}_{ch.src}"] = ch

    def simulate_path(path):
        survived = True
        fidelity = 1.0
        for i in range(len(path) - 1):
            ch = ch_map.get(f"{path[i]}_{path[i+1]}")
            if not ch: return False, 0.0
            
            att_db = (ch.attenuation or 0.0002) * (ch.distance or 1000.0)
            trans = 10 ** (-att_db / 10.0)
            if rng.random() > trans: return False, 0.0
            fidelity *= (ch.fidelity or 0.95)
            
            if 0 < i < len(path) - 2:
                if rng.random() > 0.84: return False, 0.0
                fidelity *= 0.98
        return survived, fidelity

    for i in range(num_trials):
        surv_a, fid_a = simulate_path(alice_path)
        surv_b, fid_b = simulate_path(bob_path)
        basis_a = rng.randrange(2)
        basis_b = rng.randrange(2)
        res_a, res_b = None, None
        
        if surv_a and surv_b:
            base_val = rng.randrange(2)
            res_a, res_b = base_val, base_val
            if rng.random() > fid_a: res_a = 1 - res_a
            if rng.random() > fid_b: res_b = 1 - res_b
            if basis_a != basis_b: res_b = rng.randrange(2)
        elif surv_a: res_a = rng.randrange(2)
        elif surv_b: res_b = rng.randrange(2)
            
        results.append({
            "trial": i,
            "alice_basis": basis_a,
            "bob_basis": basis_b,
            "alice_result": res_a,
            "bob_result": res_b,
            "lossA": not surv_a,
            "lossB": not surv_b,
            "hops": (len(alice_path) - 1) + (len(bob_path) - 1),
        })
    return results


# ─── Simulation Endpoint ───────────────────────────────────────────────────────

@app.post("/api/simulate")
def run_simulation(config: SimulationConfig):
    global SIMULATION_TRIALS
    SIMULATION_TRIALS.clear()

    try:
        # ── Determine Alice and Bob ──────────────────────────────────────────
        alice_id = config.selectedPair.alice if config.selectedPair else None
        bob_id = config.selectedPair.bob if config.selectedPair else None

        # Fallback: look for nodes named alice/bob
        if not alice_id or not bob_id:
            ep_nodes = [n for n in config.nodes if n.type == "endpoint"]
            if len(ep_nodes) >= 2:
                fallback_a = next((n for n in ep_nodes if 'alice' in n.id.lower()), ep_nodes[0])
                fallback_b = next((n for n in ep_nodes if 'bob' in n.id.lower()), ep_nodes[1])
                alice_id = alice_id or fallback_a.id
                bob_id = bob_id or fallback_b.id

        if not alice_id or not bob_id:
            raise HTTPException(status_code=400, detail="Cannot determine Alice/Bob nodes. Provide selectedPair or at least two endpoint nodes.")

        # ── Path Discovery ────────────────────────────────────────────────────
        source_nodes = [n for n in config.nodes if n.type == "source"]
        alice_path = None
        bob_path = None
        source_id = None

        for src in source_nodes:
            pa = _find_path_bfs(src.id, alice_id, config.channels)
            pb = _find_path_bfs(src.id, bob_id, config.channels)
            if pa and pb:
                alice_path = pa
                bob_path = pb
                source_id = src.id
                break

        is_multihop = alice_path is not None and (len(alice_path) > 2 or len(bob_path) > 2)
        is_direct = alice_path is not None and len(alice_path) <= 2 and len(bob_path) <= 2

        sim_logs = [
            f"Alice: {alice_id}  Bob: {bob_id}",
            f"Source: {source_id or 'not found'}",
        ]

        # ── Multi-hop: Pure Python simulation ────────────────────────────────
        if alice_path and bob_path:
            sim_logs.append(f"Alice path: {' → '.join(alice_path)}  ({len(alice_path)-1} hops)")
            sim_logs.append(f"Bob path: {' → '.join(bob_path)}  ({len(bob_path)-1} hops)")
            sim_logs.append("Running multi-hop entanglement swapping simulation…")

            trials_result = _run_sequence_multihop(alice_path, bob_path, config, config.numTrials)

            sifted_alice, sifted_bob, errors = [], [], 0
            for t in trials_result:
                if t['alice_result'] is not None and t['bob_result'] is not None:
                    if t['alice_basis'] == t['bob_basis']:
                        sifted_alice.append(t['alice_result'])
                        sifted_bob.append(t['bob_result'])
                        if t['alice_result'] != t['bob_result']:
                            errors += 1

            total = len(sifted_alice)
            qber = (errors / total * 100) if total > 0 else 0.0

            sim_logs.append(f"Sifted key length: {total} bits")
            sim_logs.append(f"QBER: {qber:.2f}%")
            sim_logs.append(f"Entanglement swapping path: {alice_path} ↔ {bob_path}")

            return {
                "trials": trials_result,
                "logs": sim_logs,
                "siftedKeyAlice": "".join(str(b) for b in sifted_alice),
                "siftedKeyBob": "".join(str(b) for b in sifted_bob),
                "qber": qber,
                "alicePath": alice_path,
                "bobPath": bob_path,
            }

        # ── Direct / No-path: SeQUeNCe simulation ────────────────────────────
        sim_logs.append("Direct topology — using SeQUeNCe discrete-event simulation…")
        tl = Timeline()
        frequency = 100
        period = int(1e12 / frequency)

        nodes_map = {}
        for n_conf in config.nodes:
            nodes_map[n_conf.id] = Node(n_conf.id, tl)

        # Set up participant protocols for alice and bob
        for node_id in [alice_id, bob_id]:
            n_conf = next((n for n in config.nodes if n.id == node_id), None)
            if n_conf and node_id in nodes_map:
                SimParticipantProtocol(nodes_map[node_id], f"{node_id}_proto", seed=random.randint(0, 9999))

        # Set up BSM nodes
        for n_conf in config.nodes:
            if n_conf.type == "bsm" and n_conf.id in nodes_map:
                SimBSMProtocol(nodes_map[n_conf.id], f"{n_conf.id}_proto", seed=random.randint(0, 9999))

        # Set up sources
        sources_list = []
        for src_conf in [n for n in config.nodes if n.type == "source"]:
            node = nodes_map[src_conf.id]
            spdc_c = next((c for c in src_conf.components if c.type == "SPDCSource"), None)
            mpn = spdc_c.mean_photon_num if spdc_c else 10.0
            src = TrackedSPDCSource(f"{src_conf.id}_src", tl, frequency=frequency, mean_photon_num=mpn, encoding_type=polarization)
            src.owner = node
            node.add_component(src)
            sources_list.append((src_conf.id, src))

        # Add channels
        qch_list = []
        for ch in config.channels:
            if ch.src not in nodes_map or ch.dst not in nodes_map:
                continue
            if ch.type == "quantum":
                qch = QuantumChannel(ch.id, tl, attenuation=ch.attenuation, distance=ch.distance,
                                     polarization_fidelity=ch.fidelity, frequency=frequency)
                qch.set_ends(nodes_map[ch.src], ch.dst)
                qch_list.append(qch)
            else:
                cc = ClassicalChannel(ch.id, tl, distance=ch.distance, delay=ch.delay)
                cc.set_ends(nodes_map[ch.src], ch.dst)

        # Wire sources to their quantum channels
        for src_id, src_obj in sources_list:
            src_channels = [q for q in qch_list if q.sender.name == src_id]
            if len(src_channels) >= 1:
                src_obj.channels = tuple(src_channels[:2])
                for ch in src_channels[:2]:
                    recv_node = nodes_map.get(ch.receiver)
                    if recv_node and recv_node.first_component_name:
                        comp_name = recv_node.first_component_name
                        src_obj.add_receiver(recv_node.components[comp_name])

        tl.init()
        bell_amp = msqrt(0.5)
        for _, src_obj in sources_list:
            src_obj.emit([(complex(bell_amp), complex(bell_amp))] * config.numTrials)
        tl.run()

        # Post-process
        trials_result, sifted_alice, sifted_bob, errors = [], [], [], 0
        for i in range(config.numTrials):
            info = SIMULATION_TRIALS.get(i, {})
            alice_b = info.get(f'{alice_id}_basis')
            bob_b = info.get(f'{bob_id}_basis')
            alice_r = info.get(f'{alice_id}_result')
            bob_r = info.get(f'{bob_id}_result')

            surv_a = alice_r is not None
            surv_b = bob_r is not None

            # BSM correction for BSM nodes
            has_bsm = any(n.type == "bsm" for n in config.nodes)
            bsm_ok = False
            if has_bsm:
                if info.get('bsm_photon_count', 0) == 2 and 'bsm_result' in info:
                    bsm_ok = True
                    if info['bsm_result'] in [1, 3] and bob_r is not None:
                        bob_r = 1 - bob_r
                else:
                    sim_logs.append(f"Trial {i+1}: BSM photon loss.")
                    continue

            trials_result.append({
                "trial": i,
                "alice_basis": alice_b if surv_a else random.randint(0, 1),
                "bob_basis": bob_b if surv_b else random.randint(0, 1),
                "alice_result": alice_r,
                "bob_result": bob_r,
                "lossA": not surv_a,
                "lossB": not surv_b,
                "bsm": bsm_ok,
                "hops": 1,
            })

            if surv_a and surv_b and alice_b == bob_b:
                sifted_alice.append(alice_r)
                sifted_bob.append(bob_r)
                if alice_r != bob_r:
                    errors += 1

        total = len(sifted_alice)
        qber = (errors / total * 100) if total > 0 else 0.0
        sim_logs += [f"Sifted key: {total} bits", f"QBER: {qber:.2f}%"]

        return {
            "trials": trials_result,
            "logs": sim_logs,
            "siftedKeyAlice": "".join(str(b) for b in sifted_alice),
            "siftedKeyBob": "".join(str(b) for b in sifted_bob),
            "qber": qber,
            "alicePath": [alice_id],
            "bobPath": [bob_id],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "multi-hop quantum network"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
