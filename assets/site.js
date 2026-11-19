if (navigator.clipboard) {
  for (const block of document.querySelectorAll('.code')) {
    const header = block.querySelector('.code-header')
    const code = block.querySelector('pre code')
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Copy'
    button.setAttribute('aria-label', 'Copy ' + header.textContent + ' code')
    const status = document.createElement('span')
    status.setAttribute('role', 'status')
    status.className = 'copy-status'
    let timer
    let attempt = 0
    button.addEventListener('click', async () => {
      const current = ++attempt
      clearTimeout(timer)
      try {
        await navigator.clipboard.writeText(code.textContent)
        if (current !== attempt) return
        button.dataset.copied = ''
        status.textContent = 'Copied to clipboard.'
        button.textContent = 'Copied'
      } catch {
        if (current !== attempt) return
        delete button.dataset.copied
        status.textContent = 'Clipboard unavailable. Select and copy the code directly.'
        button.textContent = 'Retry copy'
      }
      timer = setTimeout(() => {
        status.textContent = ''
        button.textContent = 'Copy'
        delete button.dataset.copied
      }, 2200)
    })
    header.append(status, button)
  }
}
