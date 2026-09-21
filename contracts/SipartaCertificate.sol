// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SipartaCertificate
 * @notice Soulbound Token (SBT) untuk bukti kelulusan edukasi K3 Keselamatan Kimia.
 * @dev Sesuai siparta_architecture_design.md Section 7:
 *      - ERC-721 SBT (non-transferable).
 *      - Fungsi utama: issueCertificate(address student, uint256 courseId)
 *      - Di-mint oleh admin/relayer, dimiliki selamanya oleh student.
 *
 * Menggunakan implementasi ERC-721 minimal tanpa OpenZeppelin
 * agar deployment cost rendah di Polygon Amoy testnet.
 */
contract SipartaCertificate {

    // ============================================================
    // EVENTS (ERC-721 Standard)
    // ============================================================

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    
    event CertificateIssued(
        uint256 indexed tokenId,
        address indexed student,
        uint256 courseId,
        uint256 timestamp
    );

    // ============================================================
    // STATE
    // ============================================================

    string public name = "SIPARTA Safety Certificate";
    string public symbol = "SIPARTA-SBT";
    
    address public owner;
    uint256 private _nextTokenId;

    /// @notice Mapping tokenId => pemilik
    mapping(uint256 => address) public ownerOf;

    /// @notice Mapping address => jumlah token yang dimiliki
    mapping(address => uint256) public balanceOf;

    /// @notice Metadata sertifikat
    struct Certificate {
        address student;
        uint256 courseId;
        uint256 issuedAt;
        string metadataURI; // IPFS URI berisi detail sertifikat
    }

    /// @notice Mapping tokenId => data sertifikat
    mapping(uint256 => Certificate) public certificates;

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "SipartaCertificate: caller is not owner");
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor() {
        owner = msg.sender;
        _nextTokenId = 1; // Token ID mulai dari 1
    }

    // ============================================================
    // CORE FUNCTIONS
    // ============================================================

    /**
     * @notice Menerbitkan sertifikat SBT kepada mahasiswa yang lulus edukasi K3.
     * @param student   Address wallet mahasiswa (dari Metamask via SIWE).
     * @param courseId  ID kursus/modul edukasi yang telah diselesaikan.
     * @param metadataURI URI IPFS berisi detail sertifikat (nama, tanggal, skor, dll).
     * @return tokenId  ID token SBT yang diterbitkan.
     */
    function issueCertificate(
        address student,
        uint256 courseId,
        string calldata metadataURI
    ) external onlyOwner returns (uint256 tokenId) {
        require(student != address(0), "SipartaCertificate: zero address");

        tokenId = _nextTokenId++;

        ownerOf[tokenId] = student;
        balanceOf[student]++;

        certificates[tokenId] = Certificate({
            student: student,
            courseId: courseId,
            issuedAt: block.timestamp,
            metadataURI: metadataURI
        });

        emit Transfer(address(0), student, tokenId);
        emit CertificateIssued(tokenId, student, courseId, block.timestamp);
    }

    /**
     * @notice Mengambil URI metadata sertifikat.
     * @param tokenId ID token SBT.
     * @return URI string IPFS.
     */
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(ownerOf[tokenId] != address(0), "SipartaCertificate: nonexistent token");
        return certificates[tokenId].metadataURI;
    }

    /**
     * @dev SOULBOUND: Transfer diblokir secara permanen.
     *      Token tidak bisa dijual, dikirim, atau dipindahtangankan.
     */
    function transferFrom(address, address, uint256) external pure {
        revert("SipartaCertificate: Soulbound Token - transfer disabled");
    }

    function approve(address, uint256) external pure {
        revert("SipartaCertificate: Soulbound Token - approval disabled");
    }

    /// @notice Transfer ownership contract ke admin baru.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SipartaCertificate: zero address");
        owner = newOwner;
    }
}
