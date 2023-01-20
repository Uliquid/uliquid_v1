import * as ethers from 'ethers'
import { sleep } from '../../../../src/utils';

const hre = require("hardhat");



export default async function main(
    WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    admin:string|null=null,
    approvedLendingPools:string[]=['0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9'],
    swapperAddress:string='',
    targetGasPrice:number=0
) {
    let signer:ethers.Signer = await hre.ethers.getSigner()   
    if(!admin)
         admin = await signer.getAddress()

    
    let swapper = await hre.ethers.getContractFactory("Swap");
    const Leverage = await hre.ethers.getContractFactory("StarlayLeverage"); 

    async function deploy() {
        if (swapperAddress) {
            swapper = new ethers.Contract(
                swapperAddress,
                swapper.interface,
                signer
            )
        } else {
            swapper = await swapper.deploy(WETH);
            await swapper.deployed();
        }
      

        const leverage = await Leverage.deploy(admin, swapper.address, approvedLendingPools);
        await leverage.deployed();

        console.log('swapper', swapper.address)
        console.log('leverage', leverage.address)
    }


    if (!targetGasPrice) {    
        await deploy()
    } else {
        while (true) {
            let provider = signer.provider
            if (!provider) throw new Error ('Provider not set')
            let block = await provider.getBlock(await provider.getBlockNumber())
            console.log(`Current baseFeePerGas ${Number(block.baseFeePerGas)/ 10** 9}gwei`)
            
            if (Number(block.baseFeePerGas) <=  targetGasPrice) {
                await deploy()
                break
            }
            await sleep(15)
        }
    }
    
    
}







if (require.main == module) {
    main(
        undefined,
        undefined,
        undefined,
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        undefined
    )
}
















