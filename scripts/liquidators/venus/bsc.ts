import compoundLiquidator from '../compound/compoundLiquidator'



let WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
let admin = '0xF832F8c0ab1C59bbD00d7647331A8C78dE1DDc8C'
let treasury = '0xE07e377cD396478635727599F6897Ef72f4a132f'
let approvedLendingPools = [
    '0xE29A55A6AEFf5C8B1beedE5bCF2F0Cb3AF8F91f5', //valas
]

compoundLiquidator(
    WBNB,
    admin,
    treasury,
    approvedLendingPools
).catch(console.log)
