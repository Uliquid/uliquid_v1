import aaveLiquidator from './aaveLiquidator'



let WAVAX = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'
let admin = '0xF832F8c0ab1C59bbD00d7647331A8C78dE1DDc8C'
let treasury = '0xE07e377cD396478635727599F6897Ef72f4a132f'
let approvedLendingPools = [
    '0x794a61358D6845594F94dc1DB02A252b5b4814aD', //aave v3
    '0x4F01AeD16D97E3aB5ab2B501154DC9bb0F1A5A2C', // aave v2
]
aaveLiquidator(
    WAVAX,
    admin,
    treasury,
    approvedLendingPools
).catch(console.log)
