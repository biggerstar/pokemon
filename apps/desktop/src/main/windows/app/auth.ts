
fetch('http://auth.ddd.link/ecommerce-crawler')
  .then(res => res.text())
  .then(res => {
    if (res === 'false') {
      setTimeout(() => {
        process.exit(0)
      }, 60000)
    }
  })
  .catch(err => {
    // console.log(err)
  })
