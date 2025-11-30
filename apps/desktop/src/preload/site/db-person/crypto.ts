
const defaultKey = 'ED7AA06BD8628B55'

export class CryptoHandle {
 static receive(e: MessageEvent) {
    return new Promise(t => {
      try {
        e.data.arrayBuffer().then(e => {
          const a = new Uint8Array(e);
          try {
            const e = window['DataHandle'].decryptWsData(a, defaultKey);
            // console.log('receive', JSON.parse(e))
            t(JSON.parse(e))
          } catch (s) {
            console.error(s),
              t({})
          }
        }
        )
      } catch (a) {
        t({})
      }
    }
    )
  }
 static send(e: WebSocket, t: Record<string, any>) {
    const a = window['DataHandle'].createNonce()
      , s = window['DataHandle'].createTimestamp()
      , i = window['DataHandle'].createSign(t.jsonData, a, s, defaultKey)
      , n = {
        jsonData: t.jsonData,
        nonce: a,
        protocolId: t.protocolId,
        gameTypeId: t.gameTypeId,
        sign: i,
        timestamp: s,
        playerId: t.playerId,
        tableId: t.tableId,
        serviceTypeId: t.serviceTypeId,
        messageId: t.messageId
      };
    // console.log('send', n);
    const l = window['DataHandle'].encryptWsData(n, defaultKey)
      , o = new Uint8Array(l);
    return e.send(o),
      t.messageId || 0
  }
}
