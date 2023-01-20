import * as ethers from 'ethers'

const hre = require("hardhat");

export default async function main(
    WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    admin:string|null=null,
    treasury:string|null=null,
    approvedLendingPools:string[]=['0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9']
) {
    let signer = await hre.ethers.getSigner()   
    if(!admin)
         admin = await signer.getAddress()
    if (!treasury)
        treasury = admin;
        
    //let swapper = await hre.ethers.getContractFactory("Swap");
    //swapper = await swapper.deploy(WETH);
    //await swapper.deployed();

        
    
    const Liquidator = await hre.ethers.getContractFactory("CompoundLiquidator"); 
    const liquidator = await Liquidator.deploy(
        admin, 
        treasury, 
        '0xB7fD6f60E7094BF1F4EDf7b8Bc7fC2c896736aF1', 
        WETH,
        approvedLendingPools);
    await liquidator.deployed();

    console.log('swapper', '0xB7fD6f60E7094BF1F4EDf7b8Bc7fC2c896736aF1')
    console.log('liquidator', liquidator.address)
    
}







if (require.main == module) {
    main(

    )
}
















