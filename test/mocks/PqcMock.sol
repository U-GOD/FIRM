// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Stand-in for the Diana precompiles. This is not ML-DSA.
/// A signature is valid only when it is 4,627 bytes, the first word is
/// keccak256(abi.encode(pubkey, keccak256(message))), and every other byte is zero.
/// Etch this code onto 0x…0a01 and 0x…0a02. Storage is per address, so label keys
/// on the status address. When `active` is false the call returns empty data.
contract PqcMock {
    uint256 internal constant SIG_LENGTH = 4627;
    uint256 internal constant KEY_LENGTH = 2592;

    struct Record {
        bool registered;
        uint8 algorithmId;
        bool possessionProven;
        bytes pubkey;
    }

    bool public active;
    mapping(address account => Record record) private records;

    function setActive(bool on) external {
        active = on;
    }

    function setKey(address account, bytes calldata pubkey, uint8 algorithmId, bool possessionProven) external {
        if (pubkey.length != KEY_LENGTH) revert BadKeyLength();
        records[account] = Record({
            registered: true,
            algorithmId: algorithmId,
            possessionProven: possessionProven,
            pubkey: pubkey
        });
    }

    error BadKeyLength();

    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven)
    {
        if (!active) {
            assembly {
                return(0, 0)
            }
        }
        Record storage record = records[account];
        return (record.registered, record.algorithmId, record.pubkey, record.possessionProven);
    }

    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid)
    {
        if (!active) {
            assembly {
                return(0, 0)
            }
        }
        if (signature.length != SIG_LENGTH) return false;
        bytes32 expected = keccak256(abi.encode(pubkey, keccak256(message)));
        bytes32 got;
        assembly {
            got := calldataload(signature.offset)
        }
        if (got != expected) return false;
        for (uint256 i = 32; i < SIG_LENGTH; ++i) {
            if (signature[i] != 0) return false;
        }
        return true;
    }
}
