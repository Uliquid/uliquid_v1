import aaveLeverager from './aaveLeverager'



let WMATIC = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
let admin = '0xF832F8c0ab1C59bbD00d7647331A8C78dE1DDc8C'
let treasury = '0xE07e377cD396478635727599F6897Ef72f4a132f'
let approvedLendingPools = [
    '0x794a61358D6845594F94dc1DB02A252b5b4814aD', //aave v3
    '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf', //aave v2
]
let swapperAddress = '0xe731f096217B852765a0824865C31b69a51b3E44'
aaveLeverager(
    WMATIC,
    admin,
    approvedLendingPools,
    swapperAddress
).catch(console.log)
