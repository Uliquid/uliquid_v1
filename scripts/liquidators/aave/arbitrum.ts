import aaveLiquidator from './aaveLiquidator'



let WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
let admin = '0xF832F8c0ab1C59bbD00d7647331A8C78dE1DDc8C'
let treasury = '0xE07e377cD396478635727599F6897Ef72f4a132f'
let approvedLendingPools = [
    '0x794a61358D6845594F94dc1DB02A252b5b4814aD', //aave
    '0x2032b9A8e9F7e76768CA9271003d3e43E1616B1F', //radiant
]
aaveLiquidator(
    WETH,
    admin,
    treasury,
    approvedLendingPools
).catch(console.log)
