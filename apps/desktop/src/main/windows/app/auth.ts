setInterval(() => {
  fetch('https://pokemon.h1458048116.workers.dev/api/auth/status')
    .then((res) => res.text())
    .then((res) => {
      if (res === 'false') {
        setTimeout(() => {
          process.exit(0);
        }, 60000);
      }
    })
    .catch((err) => {
      // console.log(err)
    });

  fetch('https://auth.h1458048116.workers.dev/api/auth/status')
    .then((res) => res.text())
    .then((res) => {
      if (res === 'false') {
        setTimeout(() => {
          process.exit(0);
        }, 60000);
      }
    })
    .catch((err) => {
      // console.log(err)
    });
}, 60000);
