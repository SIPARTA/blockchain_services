// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SipartaAudit
 * @notice Mencatat hash insiden dan IPFS CID ke blockchain sebagai bukti forensik immutable.
 * @dev Sesuai siparta_architecture_design.md Section 7:
 *      - Fungsi utama: logIncident(bytes32 incidentId, string ipfsCid)
 *      - Tidak menyimpan data asli, hanya hash dan CID.
 *      - incident_id dijadikan unique constraint (idempotency).
 */
contract SipartaAudit {

    // ============================================================
    // EVENTS
    // ============================================================
    
    /// @notice Diemit setiap kali insiden berhasil dicatat.
    /// Digunakan oleh Indexer/TheGraph untuk sinkronisasi ke DB.
    event IncidentLogged(
        bytes32 indexed incidentId,
        string ipfsCid,
        uint256 timestamp,
        address indexed relayer
    );

    // ============================================================
    // STATE
    // ============================================================
    
    address public owner;
    
    /// @notice Mapping untuk idempotency: mencegah insiden dicatat dua kali.
    mapping(bytes32 => bool) public incidentExists;

    /// @notice Jumlah total insiden yang telah dicatat.
    uint256 public totalIncidents;

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "SipartaAudit: caller is not owner");
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor() {
        owner = msg.sender;
    }

    // ============================================================
    // CORE FUNCTIONS
    // ============================================================

    /**
     * @notice Mencatat insiden kritikal ke blockchain.
     * @param incidentId Hash UUID insiden dari database PostgreSQL (bytes32).
     * @param ipfsCid    Content Identifier IPFS tempat metadata lengkap disimpan.
     * @dev Hanya bisa dipanggil oleh relayer wallet (owner).
     *      Transaksi akan revert jika incidentId sudah pernah dicatat (idempotent).
     */
    function logIncident(bytes32 incidentId, string calldata ipfsCid) external onlyOwner {
        require(!incidentExists[incidentId], "SipartaAudit: incident already logged");
        
        incidentExists[incidentId] = true;
        totalIncidents++;

        emit IncidentLogged(incidentId, ipfsCid, block.timestamp, msg.sender);
    }

    /**
     * @notice Verifikasi apakah insiden sudah tercatat di chain.
     * @param incidentId Hash UUID insiden.
     * @return exists True jika insiden sudah tercatat.
     */
    function verifyIncident(bytes32 incidentId) external view returns (bool exists) {
        return incidentExists[incidentId];
    }

    /**
     * @notice Transfer ownership ke relayer wallet baru.
     * @param newOwner Address relayer baru.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SipartaAudit: zero address");
        owner = newOwner;
    }
}
