import aaveLiquidator from './aaveLiquidator'



let WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
let admin = '0xF832F8c0ab1C59bbD00d7647331A8C78dE1DDc8C'
let treasury = '0xE07e377cD396478635727599F6897Ef72f4a132f'
let approvedLendingPools = [
    '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9', //aave
]
aaveLiquidator(
    WETH,
    admin,
    treasury,
    approvedLendingPools,
    10 * 10 ** 9 
).catch(console.log)
