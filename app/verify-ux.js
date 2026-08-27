const toolShell = document.querySelector('.tool-shell')
const verifyPanel = document.querySelector('#verify-panel')
const verificationResult = document.querySelector('#verification-result')
const verificationNote = document.querySelector('#verification-note')
const verificationWarning = document.querySelector('#verification-warning')
const savedStatus = document.querySelector('#saved-status')
const savedOriginalFile = document.querySelector('#saved-original-file')
const savedReceipt = document.querySelector('#saved-receipt')
const checkSavedProof = document.querySelector('#check-saved-proof')
const checkReceiptOnly = document.querySelector('#check-receipt-only')
const checkCurrentProof = document.querySelector('#check-current-proof')
const verifyAnother = document.querySelector('#verify-another')
const modeVerify = document.querySelector('#mode-verify')

let resultSource = null

function markResultSource(source) {
  resultSource = source
}

checkSavedProof.addEventListener('click', () => markResultSource('saved'), { capture: true })
checkReceiptOnly.addEventListener('click', () => markResultSource('saved'), { capture: true })
checkCurrentProof.addEventListener('click', () => markResultSource('current'), { capture: true })

function syncVerificationResult() {
  if (verificationResult.hidden) {
    toolShell.classList.remove('saved-result-active')
    verificationResult.removeAttribute('data-source')
    verificationWarning.hidden = true
    verificationWarning.textContent = ''
    return
  }

  const source = resultSource || (modeVerify.checked ? 'saved' : 'current')
  verificationResult.dataset.source = source
  toolShell.classList.toggle('saved-result-active', source === 'saved')

  if (source === 'saved') {
    if (!savedStatus.classList.contains('error')) savedStatus.textContent = ''

    const note = verificationNote.textContent
    const calendarRequestsFailed = /approved calendar request/i.test(note) && /failed during this check/i.test(note)
    verificationWarning.hidden = !calendarRequestsFailed
    verificationWarning.textContent = calendarRequestsFailed
      ? 'The timestamp calendars could not be reached during this check. Your receipt is safe. Try again later.'
      : ''

    requestAnimationFrame(() => {
      verificationResult.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

new MutationObserver(syncVerificationResult).observe(verificationResult, {
  attributes: true,
  attributeFilter: ['hidden'],
})

function syncSavedError() {
  const mismatch = savedStatus.classList.contains('error') && /does not match this ProofStamp/i.test(savedStatus.textContent)
  verifyPanel.classList.toggle('mismatch-active', mismatch)

  if (mismatch) {
    const concise = 'The selected file is different from the file recorded in this ProofStamp. Try another file. Bitcoin was not checked.'
    if (savedStatus.textContent !== concise) savedStatus.textContent = concise
  }
}

new MutationObserver(syncSavedError).observe(savedStatus, {
  attributes: true,
  childList: true,
  subtree: true,
  attributeFilter: ['class'],
})

verifyAnother.addEventListener('click', () => {
  resultSource = 'saved'
  verificationResult.hidden = true
  toolShell.classList.remove('saved-result-active')

  savedOriginalFile.value = ''
  savedReceipt.value = ''
  savedOriginalFile.dispatchEvent(new Event('change', { bubbles: true }))
  savedReceipt.dispatchEvent(new Event('change', { bubbles: true }))
  savedStatus.textContent = ''
  modeVerify.checked = true

  requestAnimationFrame(() => {
    verifyPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    savedOriginalFile.focus()
  })
})
