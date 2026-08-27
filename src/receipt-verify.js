import {
  MAX_IMPORTED_RECEIPT_BYTES as MAX_IMPORTED_RECEIPT_BYTES_V1,
  parseAndValidateProofStampReceiptText as parseAndValidateV1,
  updateReceiptWithProof as updateV1,
} from './receipt-verify-v1.js'
import {
  MAX_IMPORTED_RECEIPT_BYTES_V2,
  parseAndValidateProofStampReceiptV2Text,
  updateReceiptV2WithProof,
} from './receipt-v2.js'

export const MAX_IMPORTED_RECEIPT_BYTES = Math.max(MAX_IMPORTED_RECEIPT_BYTES_V1, MAX_IMPORTED_RECEIPT_BYTES_V2)

function receiptVersionFromText(text) {
  if (typeof text !== 'string') throw new TypeError('Receipt text is required')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new Error('Receipt is not valid JSON', { cause })
  }
  return parsed?.version
}

export async function parseAndValidateProofStampReceiptText(text, subtle = globalThis.crypto?.subtle) {
  const version = receiptVersionFromText(text)
  if (version === 2) return parseAndValidateProofStampReceiptV2Text(text, subtle)
  if (version === 1) {
    const validated = await parseAndValidateV1(text, subtle)
    return Object.freeze({ ...validated, proofTarget: 'manifest-v1' })
  }
  throw new Error('Unsupported ProofStamp receipt version')
}

export async function updateReceiptWithProof(receipt, proofBytes, verification = null, subtle = globalThis.crypto?.subtle) {
  if (receipt?.version === 2) return updateReceiptV2WithProof(receipt, proofBytes, verification, subtle)
  if (receipt?.version === 1) return updateV1(receipt, proofBytes, verification, subtle)
  throw new Error('Unsupported ProofStamp receipt version')
}

export function receiptFileSha256(receipt) {
  if (receipt?.version === 2 && receipt?.proofTarget === 'file-sha256') return receipt.fileSha256
  if (receipt?.version === 1) return receipt?.localHashAgreement?.fileSha256
  throw new Error('Unsupported ProofStamp receipt version')
}

export function receiptTimestampDigestSha256(receipt) {
  if (receipt?.version === 2 && receipt?.proofTarget === 'file-sha256') return receipt.fileSha256
  if (receipt?.version === 1) return receipt.manifestCommitmentSha256
  throw new Error('Unsupported ProofStamp receipt version')
}
