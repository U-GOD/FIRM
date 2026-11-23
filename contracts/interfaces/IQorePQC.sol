// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Diana precompiles. Interface from the QoreChain EVM precompile docs.
/// `pqcVerify` is `0x…0a01`. `pqcKeyStatus` is `0x…0a02`.
/// An inactive precompile returns empty data and does not revert. Callers must
/// check the return length before they trust a decoded bool.
interface IQorePQC {
    /// @notice Verify an ML-DSA-87 signature over the raw message bytes.
    /// @dev Empty context. The precompile does not hash `message`.
    /// @param pubkey 2,592-byte ML-DSA-87 public key.
    /// @param signature 4,627-byte ML-DSA-87 signature.
    /// @param message The bytes that were signed.
    /// @return valid True when the signature matches. False on a bad signature. Does not revert.
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid);

    /// @notice Registered post-quantum key for an account.
    /// @dev Proof of possession is optional at registration. `registered` alone is not enough.
    /// @return registered Whether a key is registered.
    /// @return algorithmId 1 means ML-DSA-87.
    /// @return pubkey The registered key, or empty.
    /// @return possessionProven Whether registration included a verified proof of possession.
    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven);
}
