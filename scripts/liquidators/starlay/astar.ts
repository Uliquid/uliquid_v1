import starlayLiquidator from './starlayLiquidator'



let WASTR = '0xAeaaf0e2c81Af264101B9129C00F4440cCF0F720'
let admin = '0xF832F8c0ab1C59bbD00d7647331A8C78dE1DDc8C'
let treasury = '0xE07e377cD396478635727599F6897Ef72f4a132f'
let approvedLendingPools = [
    '0x90384334333f3356eFDD5b20016350843b90f182', //starlay
]
starlayLiquidator(
    WASTR,
    admin,
    treasury,
    approvedLendingPools
).catch(console.log)
