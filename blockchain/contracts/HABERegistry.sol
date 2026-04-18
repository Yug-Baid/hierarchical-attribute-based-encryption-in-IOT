// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract HABERegistry {

    enum Role { UNREGISTERED, RM, DM, SDM }

    struct NodeRecord {
        Role    role;
        address parentAddr;
        uint256 timestamp;
        bool    exists;
    }

    struct HashRecord {
        bytes32 hash;
        string  meta;
        uint256 timestamp;
        bool    exists;
    }

    address public admin;
    mapping(address => NodeRecord) public nodes;
    mapping(string  => HashRecord) public hashes;
    address[] public nodeList;

    event NodeRegistered(address indexed addr, uint8 role, address indexed parentAddr, uint256 timestamp);
    event HashStored(string fileId, bytes32 hash, string meta, uint256 timestamp);
    event AuditLog(string eventName, string data, uint256 timestamp);

    constructor() {
        admin = msg.sender;
        nodes[msg.sender] = NodeRecord(Role.RM, address(0), block.timestamp, true);
        nodeList.push(msg.sender);
        emit NodeRegistered(msg.sender, uint8(Role.RM), address(0), block.timestamp);
    }

    function registerNode(address addr, uint8 role, address parentAddr) external {
        require(msg.sender == admin, "Only admin");
        require(!nodes[addr].exists, "Already registered");
        require(role >= uint8(Role.DM) && role <= uint8(Role.SDM), "Invalid role");

        nodes[addr] = NodeRecord(Role(role), parentAddr, block.timestamp, true);
        nodeList.push(addr);

        emit NodeRegistered(addr, role, parentAddr, block.timestamp);
        emit AuditLog("registerNode", _toHexString(addr), block.timestamp);
    }

    function storeHash(string calldata fileId, bytes32 hash, string calldata meta) external {
        require(nodes[msg.sender].exists, "Not registered");
        require(!hashes[fileId].exists, "Already stored");

        hashes[fileId] = HashRecord(hash, meta, block.timestamp, true);

        emit HashStored(fileId, hash, meta, block.timestamp);
        emit AuditLog("storeHash", fileId, block.timestamp);
    }

    function getHash(string calldata fileId)
        external view
        returns (bytes32 hash, string memory meta, uint256 timestamp)
    {
        require(hashes[fileId].exists, "Not found");
        HashRecord storage r = hashes[fileId];
        return (r.hash, r.meta, r.timestamp);
    }

    function auditLog(string calldata eventName, string calldata data) external {
        require(nodes[msg.sender].exists, "Not registered");
        emit AuditLog(eventName, data, block.timestamp);
    }

    function getNode(address addr)
        external view
        returns (uint8 role, address parentAddr, uint256 timestamp)
    {
        require(nodes[addr].exists, "Not found");
        NodeRecord storage n = nodes[addr];
        return (uint8(n.role), n.parentAddr, n.timestamp);
    }

    function listNodes() external view returns (address[] memory) {
        return nodeList;
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory data = abi.encodePacked(addr);
        bytes memory chars = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = '0'; str[1] = 'x';
        for (uint i = 0; i < 20; i++) {
            str[2+i*2]   = chars[uint8(data[i] >> 4)];
            str[2+i*2+1] = chars[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }
}
