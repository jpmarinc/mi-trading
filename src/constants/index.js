// §CONSTANTS — constantes globales
export const PROXY = "http://localhost:3001";

const DEC31       = new Date("2026-12-31");
export const months_left = Math.max(0, (DEC31.getFullYear()-new Date().getFullYear())*12+(DEC31.getMonth()-new Date().getMonth())+1);

// §DEFAULT_LEV
export const DEFAULT_LEV = [5,10,15,20,25,50,75,100,125,150,200];

// §RVALUES — R por cuenta
export const DEFAULT_R_VALUES = { quantfury: 2.65, binance: 35, hyperliquid: 35 };

// §ACCOUNTS_INIT
export const ACCOUNTS_INIT = [
  { id:"quantfury",   name:"Quantfury",   balance:57.67,  color:"#00d4ff", apiKey:"", apiSecret:"", type:"manual",      note:"Sin API pública — balance manual." },
  { id:"binance",     name:"Binance",     balance:170.00, color:"#f0b90b", apiKey:"", apiSecret:"", type:"binance",     note:"API Key Read Only. Precios sin key." },
  { id:"hyperliquid", name:"Hyperliquid", balance:0,      color:"#9b59b6", apiKey:"", apiSecret:"", type:"hyperliquid", note:"Wallet pública (0x...). NUNCA el private key." },
];

// §OPEN_INIT
export const OPEN_INIT = [
  { id:"pos1", asset:"OIL", type:"Long", account:"quantfury", entry:66.19, sl:null, tp:null, size:2000, leverage:1, upnl:4.33, margin:57.67, openedAt:"2026-02-21", source:"YO", reasoning:"Long OIL sin SL ⚠️", orderType:"Market" },
];

// §CLOSED_INIT — trades históricos
export const CLOSED_INIT = [
  { id:1,  date:"2025-12-10", asset:"ETH",  type:"Short", account:"quantfury", entry:1925, sl:1951, tp:1880, leverage:20, orderType:"Market", outcome:"LOSS",     pnl:-6.76,  source:"Silla", reasoning:"PA short" },
  { id:2,  date:"2025-12-18", asset:"BTC",  type:"Short", account:"quantfury", entry:null, sl:null, tp:null, leverage:20, orderType:"Market", outcome:"LOSS",     pnl:-9.39,  source:"YO",    reasoning:"" },
  { id:3,  date:"2025-12-26", asset:"ETH",  type:"Short", account:"quantfury", entry:null, sl:null, tp:null, leverage:20, orderType:"Market", outcome:"LOSS",     pnl:-8.26,  source:"Silla", reasoning:"" },
  { id:4,  date:"2026-01-05", asset:"GOLD", type:"Long",  account:"quantfury", entry:null, sl:null, tp:null, leverage:20, orderType:"Market", outcome:"Partial L",pnl:-0.28,  source:"YO",    reasoning:"" },
  { id:5,  date:"2026-01-12", asset:"LTC",  type:"Long",  account:"quantfury", entry:null, sl:null, tp:null, leverage:20, orderType:"Limit",  outcome:"Partial L",pnl:-0.57,  source:"YO",    reasoning:"" },
  { id:6,  date:"2026-01-20", asset:"MSTR", type:"Short", account:"quantfury", entry:null, sl:null, tp:null, leverage:20, orderType:"Market", outcome:"LOSS",     pnl:-77.82, source:"YO",    reasoning:"Sin SL ⚠️" },
  { id:7,  date:"2026-01-28", asset:"XRP",  type:"Short", account:"quantfury", entry:null, sl:null, tp:null, leverage:20, orderType:"Market", outcome:"Partial L",pnl:-18.20, source:"Mizer", reasoning:"" },
  { id:8,  date:"2026-02-05", asset:"MSTR", type:"Short", account:"quantfury", entry:null, sl:null, tp:null, leverage:20, orderType:"Market", outcome:"LOSS",     pnl:-13.61, source:"YO",    reasoning:"" },
  { id:9,  date:"2026-02-12", asset:"NKE",  type:"Long",  account:"quantfury", entry:null, sl:null, tp:null, leverage:20, orderType:"Market", outcome:"LOSS",     pnl:-10.04, source:"YO",    reasoning:"" },
];

// §DEBTS_INIT — paymentHistory added for undo support
export const DEBTS_INIT = [
  { id:1, name:"Hipotecario",       amount:2000, priority:"Muy Alta", paid:0, paymentHistory:[], monthlyClp:800000 },
  { id:2, name:"Préstamo Personal", amount:2800, priority:"Muy Alta", paid:0, paymentHistory:[], monthlyClp:300000 },
  { id:3, name:"Julio",             amount:800,  priority:"Alta",     paid:0, paymentHistory:[], monthlyClp:200000 },
  { id:4, name:"Mirtza",            amount:1000, priority:"Muy Baja", paid:0, paymentHistory:[], monthlyClp:0 },
  { id:5, name:"Toro",              amount:1000, priority:"Muy Baja", paid:0, paymentHistory:[], monthlyClp:0 },
  { id:6, name:"Yoss",              amount:500,  priority:"Muy Baja", paid:0, paymentHistory:[], monthlyClp:0 },
  { id:7, name:"Papá",              amount:5000, priority:"Muy Baja", paid:0, paymentHistory:[], monthlyClp:0 },
];

// §SNOWBALL_INIT
export const SNOWBALL_INIT = [
  { id:1, name:"Salida con mi polola 🌙", cost:60,  completed:false, completedAt:null },
  { id:2, name:"Zapatillas 👟",           cost:120, completed:false, completedAt:null },
  { id:3, name:"Suscripción anual 💻",    cost:100, completed:false, completedAt:null },
];

// §WATCHLIST_INIT
export const WATCHLIST_INIT = [
  { symbol:"BTC",  source:"binance" },
  { symbol:"ETH",  source:"binance" },
  { symbol:"OIL",  source:"commodity" },
];

export const PRIORITY_ORDER = { "Muy Alta":0, "Alta":1, "Muy Baja":2 };
export const PRIORITY_COLOR = { "Muy Alta":"#ef4444", "Alta":"#f97316", "Muy Baja":"#6b7280" };
export const RISK_COLORS    = { critical:"#ef4444", high:"#f97316", medium:"#eab308", low:"#22c55e" };
export const CG_IDS  = { BTC:"bitcoin", ETH:"ethereum", XRP:"ripple", LTC:"litecoin", SOL:"solana", DOGE:"dogecoin", BNB:"binancecoin" };
export const BN_SPOT = { BTC:"BTCUSDT", ETH:"ETHUSDT", XRP:"XRPUSDT", LTC:"LTCUSDT", SOL:"SOLUSDT", BNB:"BNBUSDT", DOGE:"DOGEUSDT", AVAX:"AVAXUSDT", LINK:"LINKUSDT", ARB:"ARBUSDT" };
export const HL_MAP       = { OIL:"OIL", GOLD:"GOLD", BTC:"BTC", ETH:"ETH", SOL:"SOL", XRP:"XRP", LTC:"LTC", DOGE:"DOGE" };
// Símbolos de commodities → ticker Yahoo Finance
export const COMMODITY_MAP = { OIL:"CL=F", GOLD:"GC=F", SILVER:"SI=F", GAS:"NG=F", WHEAT:"ZW=F" };

export const REQUIRED_TRADE_FIELDS = ["asset", "account", "date", "pnl", "type", "outcome", "source"];
