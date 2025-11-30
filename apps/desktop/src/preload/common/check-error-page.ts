

export function checkErrorPage(url, setTimeout) {
  if (
    location.href.includes('chrome-error://') 
    ) {
    setTimeout(() => {
      location.href = url
    }, 800)
  }
}

export function preventSomeProtocol() {
  document.addEventListener('click', (e) => {
    if (!e.target) return
    const link = e.target?.['href']
    if (link.includes('bytedance://')) {
      e.preventDefault();
      console.log('Blocked byted:// link');
    }
  }, true);
}
