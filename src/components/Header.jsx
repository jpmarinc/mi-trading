// Calcula uPnL live usando precio actual (mismo algoritmo que Dashboard/LivePositions)
function calcLiveUpnlHeader(pos, lp) {
  if (pos.orderType === "Limit") return null;
  if (!lp || !pos.entry) return null;
  const notional =
    pos.size  > 0 ? pos.size :
    pos.qty   > 0 ? pos.qty * pos.entry :
    pos.margin > 0 ? pos.margin * (pos.leverage || 1) :
    null;
  if (!notional) return null;
  return notional * ((lp - pos.entry) / pos.entry) * (pos.type === "Long" ? 1 : -1);
}

// §HEADER — 2.2: solo BTC + CLP/USD, sin OIL. Dot de conexión CLP. 2.3: selector de fuente
export default function Header({ accounts, openPositions, prices, clpRate, clpOk, loading, refresh, clpSource, setClpSource }) {
  const btc = prices["BTC"];

  return (
    <div className="hdr">
      <div className="brand">
        <h1>TRADING FRAMEWORK</h1>
        <p>Capital Protection · Risk Management · Debt Freedom</p>
      </div>
      <div className="hright">
        {/* Global prices: BTC + CLP/USD only (2.2: OIL removido) */}
        <div className="gchip">
          <span className="ld"/>
          {/* BTC chip */}
          <div className="gc">
            <span className="sym">BTC</span>
            <span className="px" style={{ color: btc ? "#f0b90b" : "#4a6280" }}>
              {btc ? `$${btc.price.toLocaleString(undefined, { maximumFractionDigits:0 })}` : "—"}
            </span>
            {btc?.change24h != null && (
              <span className="ch" style={{ color: btc.change24h >= 0 ? "#22c55e" : "#ef4444" }}>
                {btc.change24h >= 0 ? "+" : ""}{btc.change24h.toFixed(1)}%
              </span>
            )}
          </div>

          <div className="sep"/>

          {/* CLP/USD chip with connection dot (2.2) and source selector (2.3) */}
          <div className="gc" style={{ minWidth: 70 }}>
            <div style={{ display:"flex", alignItems:"center", gap:3 }}>
              <span className="sym">CLP/USD</span>
              {/* Dot: verde=OK, rojo=failed, gris=unknown */}
              <span
                className="dot"
                style={{
                  width:5, height:5,
                  background: clpOk === true ? "#22c55e" : clpOk === false ? "#ef4444" : "#4a6280",
                  boxShadow: clpOk === true ? "0 0 4px #22c55e88" : "none"
                }}
                title={clpOk === true ? "CLP OK" : clpOk === false ? "CLP fetch failed (cached)" : "Verificando..."}
              />
            </div>
            <span className="px" style={{ color:"#94a3b8" }}>{clpRate.toFixed(0)}</span>
            {/* Source selector (2.3) */}
            <select
              value={clpSource}
              onChange={e => setClpSource(e.target.value)}
              style={{ fontSize:7, background:"transparent", border:"none", color:"#4a6280", cursor:"pointer", padding:0, width:"auto", outline:"none" }}
              title="Fuente CLP/USD"
            >
              <option value="dolarapi">dolarapi</option>
              <option value="binancep2p">BN P2P</option>
              <option value="exchangerate">ExchRate</option>
            </select>
          </div>

          <button
            onClick={refresh}
            style={{ background:"none", border:"none", color:"#4a6280", cursor:"pointer", fontSize:12, padding:"0 4px" }}
          >
            {loading ? <span className="spin">↻</span> : "↻"}
          </button>
        </div>

        {/* Account balances */}
        <div className="accs">
          {accounts.map((acc, i) => {
            // uPnL live solo para posiciones de esta cuenta
            const accPositions = openPositions.filter(p => p.account === acc.id);
            const accUpnl = accPositions.reduce((s, pos) => {
              const lp = prices[pos.asset]?.price;
              const live = calcLiveUpnlHeader(pos, lp);
              return s + (live !== null ? live : (pos.upnl || 0));
            }, 0);
            return (
              <div key={acc.id} style={{ display:"flex", alignItems:"center" }}>
                {i > 0 && <div className="sep"/>}
                <div className="ac">
                  <span className="lb">{acc.name}</span>
                  {/* Balance efectivo = base + uPnL live */}
                  <span className="vl" style={{ color: acc.color }}>
                    ${(acc.balance + accUpnl).toFixed(2)}
                  </span>
                  {accPositions.length > 0 && (
                    <span className="up" style={{ color: accUpnl >= 0 ? "#22c55e" : "#ef4444", fontSize:8 }}>
                      {accUpnl >= 0 ? "+" : ""}${accUpnl.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div className="sep"/>
          <div className="ac">
            <span className="lb">1R</span>
            <span className="vl orange">${Math.max(1, accounts[0]?.balance * 0.05 || 2.65).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
