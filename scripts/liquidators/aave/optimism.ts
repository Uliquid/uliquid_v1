import aaveLiquidator from './aaveLiquidator'



let WETH = '0x4200000000000000000000000000000000000006'
let admin = '0xF832F8c0ab1C59bbD00d7647331A8C78dE1DDc8C'
let treasury = '0xE07e377cD396478635727599F6897Ef72f4a132f'
let approvedLendingPools = [
    '0x794a61358D6845594F94dc1DB02A252b5b4814aD', //aave
]
aaveLiquidator(
    WETH,
    admin,
    treasury,
    approvedLendingPools
).catch(console.log)
