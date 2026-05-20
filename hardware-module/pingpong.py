from enum import Enum, auto
from sequence.topology.node import Node
from sequence.protocol import Protocol
from sequence.message import Message
from sequence.kernel.timeline import Timeline
from sequence.components.optical_channel import ClassicalChannel
from sequence.kernel.process import Process
from sequence.kernel.event import Event
import sequence.utils.log as log

class MsgType(Enum):
    PING = auto()
    PONG = auto()

class PingProtocol(Protocol):
    def __init__(self, owner: Node, name: str, other_name: str, other_node: str):
        super().__init__(owner, name)
        owner.protocols.append(self)
        self.other_name = other_name
        self.other_node = other_node

    def init(self):
        pass

    def start(self):
        new_msg = Message(MsgType.PING, self.other_name)
        self.owner.send_message(self.other_node, new_msg)

    def received_message(self, src: str, message: Message):
        assert message.msg_type == MsgType.PONG
        log.logger.info("node {} received pong message at time {}".format(self.owner.name, self.owner.timeline.now()))
        new_msg = Message(MsgType.PING, self.other_name)
        self.owner.send_message(self.other_node, new_msg)


class PongProtocol(Protocol):
    def __init__(self, owner: Node, name: str, other_name: str, other_node: str):
        super().__init__(owner, name)
        owner.protocols.append(self)
        self.other_name = other_name
        self.other_node = other_node
    
    def init(self):
        pass

    def received_message(self, src: str, message: Message):
        assert message.msg_type == MsgType.PING
        log.logger.info("node {} received ping message at time {}".format(self.owner.name, self.owner.timeline.now()))
        new_msg = Message(MsgType.PONG, self.other_name)
        self.owner.send_message(self.other_node, new_msg)

tl = Timeline(1e12)

node1 = Node("node1", tl)
node2 = Node("node2", tl)

cc0 = ClassicalChannel("cc0", tl, 1e3)
cc1 = ClassicalChannel("cc1", tl, 1e3)
cc0.set_ends(node1, node2.name)
cc1.set_ends(node2, node1.name)

pingp = PingProtocol(node1, "pingp", "pongp", "node2")
pongp = PongProtocol(node2, "pongp", "pingp", "node1")

process = Process(pingp, "start", [])
event = Event(0, process)
tl.schedule(event)

tl.init()
log_filename = 'store.log'
log.set_logger(__name__, tl, log_filename)
log.set_logger_level('INFO')
log.track_module('pingpong')
tl.run()
