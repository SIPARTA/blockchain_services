// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title GasDetectionStorage
/// @notice On-chain archive of SIPARTA gas-detection records (Polygon Amoy).
///         Only the deployer wallet may write; anyone may read.
contract GasDetectionStorage {
    struct SensorData {
        uint256 timestamp;
        uint256 mics5524;
        uint256 tgs2600;
        uint256 mq2;
        uint256 mq135;
        string classification;
        string imageUrl;
    }

    address public owner;
    SensorData[] private _records;

    event DataStored(
        uint256 indexed id,
        uint256 timestamp,
        uint256 mics5524,
        uint256 tgs2600,
        uint256 mq2,
        uint256 mq135,
        string classification,
        string imageUrl
    );

    error InvalidClassification(string provided);

    modifier onlyOwner() {
        require(msg.sender == owner, "GasDetection: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Store one gas-detection record.
    /// @return id Index of the stored record (usable with getData).
    function addData(
        uint256 timestamp,
        uint256 mics5524,
        uint256 tgs2600,
        uint256 mq2,
        uint256 mq135,
        string calldata classification,
        string calldata imageUrl
    ) external onlyOwner returns (uint256 id) {
        if (!_isValidClassification(classification)) {
            revert InvalidClassification(classification);
        }

        _records.push(
            SensorData({
                timestamp: timestamp,
                mics5524: mics5524,
                tgs2600: tgs2600,
                mq2: mq2,
                mq135: mq135,
                classification: classification,
                imageUrl: imageUrl
            })
        );

        id = _records.length - 1;
        emit DataStored(id, timestamp, mics5524, tgs2600, mq2, mq135, classification, imageUrl);
    }

    /// @notice Read one record by index.
    function getData(uint256 id) external view returns (SensorData memory) {
        require(id < _records.length, "GasDetection: id out of range");
        return _records[id];
    }

    /// @notice Total number of stored records.
    function getTotalData() external view returns (uint256) {
        return _records.length;
    }

    function _isValidClassification(string memory classification) internal pure returns (bool) {
        bytes32 hash = keccak256(bytes(classification));
        return hash == keccak256(bytes("aman"))
            || hash == keccak256(bytes("waspada"))
            || hash == keccak256(bytes("bahaya"));
    }
}
