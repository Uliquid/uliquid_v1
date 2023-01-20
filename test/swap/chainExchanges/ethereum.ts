import { assert, expect } from 'chai'
import * as ethers from 'ethers'
import { describe, it } from 'mocha'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'

import ethereum from '../../../../src/chainExchanges/chains/ethereum'
import {Swap} from '../../../typechain-types'
import {sleep} from '../../../../src/utils'


import ERC20ABI from '../../../abi/erc20.json'
import swapArtifact from '../../../artifacts/contracts/Swap.sol/Swap.json'

const hre = require('hardhat')
const {deploySwap} = require('../deploySwap')

let swap = new ethers.Contract(
    '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
    swapArtifact.abi
)


describe("Ethereum:chainExchanges", function() {
    this.timeout(5000000)
    // FORK ETHEREUM MAINNET and run this script
    it("Should get swap data for a Uniswap V2 swap from chainExchange.swapper and execute swap ", async function(){
        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8') as ethers.Wallet
        ethereum.rpc = signer.provider as any
        swap = await deploySwap(ethereum.nativeToken) as Swap
        ethereum.setSwapperContract(swap.address)
        ethereum.start()
        
        //wait to get all exchange rates on ethereum    
        await sleep(30)


        let USDC =  new ethers.Contract(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            ERC20ABI,
            signer
        )
        let WETH =  new ethers.Contract(
            ethereum.nativeToken,
            ERC20ABI,
            signer
        )

        let prevWETHBAL = Number(await WETH.balanceOf(signer.address))
        // send 10 USDC to swap
        await USDC.transfer(swap.address, 10*10**6)
        let USDC_WETH_POOL = ethers.utils.getAddress('0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc')
        let pool = ethereum.pools[USDC_WETH_POOL]
        let swapData = await ethereum.getSwapData([{
            tokenIn: USDC.address,
            tokenOut: WETH.address,
            pool: USDC_WETH_POOL
        }])
        
        await swap.connect(signer).swap(
            10*10**6,
            swapData,
            WETH.address
        )

        let newWETHBalance = Number(await WETH.balanceOf(signer.address))
        
        expect(newWETHBalance).greaterThan(prevWETHBAL)

    })

    it("Should swap on Curve 3Pool", async function() {
        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8') as ethers.Wallet
   
        let USDC =  new ethers.Contract(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            ERC20ABI,
            signer
        )
        let DAI =  new ethers.Contract(
            '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            ERC20ABI,
            signer
        )

        let pool = '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7' //Curve 3pool
        let swapData = await ethereum.getSwapData([
            {
                tokenIn: USDC.address,
                tokenOut: DAI.address,
                pool
            },
        ])
    
        let prevDAIBAL = Number(await DAI.balanceOf(signer.address))
        // send 10 USDC to swap
        await USDC.transfer(swap.address, 10*10**6)


        await swap.connect(signer).swap(
            10*10**6,
            swapData,
            DAI.address
        )

        let newDAIBalance = Number(await DAI.balanceOf(signer.address))
        
        expect(newDAIBalance).greaterThan(prevDAIBAL)
    })

    it("Should swap on Curve 2Pool", async function() {
        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8') as ethers.Wallet
   
        let USDC =  new ethers.Contract(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            ERC20ABI,
            signer
        )
        let FRAX =  new ethers.Contract(
            '0x853d955aCEf822Db058eb8505911ED77F175b99e',
            ERC20ABI,
            signer
        )

        let pool = '0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2' //Curve 2pool
        let swapData = await ethereum.getSwapData([
            {
                tokenIn: USDC.address,
                tokenOut: FRAX.address,
                pool
            },
        ])
    
        let prevFRAXBAL = Number(await FRAX.balanceOf(signer.address))
        // send 10 USDC to swap
        await USDC.transfer(swap.address, 10*10**6)


        await swap.connect(signer).swap(
            10*10**6,
            swapData,
            FRAX.address
        )

        let newFRAXBalance = Number(await FRAX.balanceOf(signer.address))
        
        expect(newFRAXBalance).greaterThan(prevFRAXBAL)
    })

    it("Should swap on Curve LP pool", async function() {
        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8') as ethers.Wallet
   
        let USDC =  new ethers.Contract(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            ERC20ABI,
            signer
        )
        let FRAX =  new ethers.Contract(
            '0x853d955aCEf822Db058eb8505911ED77F175b99e',
            ERC20ABI,
            signer
        )

        let pool = '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B' //Curve FRAX/3CRV pool
        
        let swapData = await ethereum.getSwapData([
            {
                tokenIn: FRAX.address,
                tokenOut: '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490', //3CRV
                pool
            },
            {
                tokenIn: '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490',
                tokenOut: USDC.address,
                pool: pool //3Pool
            }
        ])
    
        let prevUSDCBAL = Number(await USDC.balanceOf(signer.address))
        // send 10 USDC to swap
        await FRAX.transfer(swap.address, ethers.utils.parseUnits('10'))


        await swap.connect(signer).swap(
            ethers.utils.parseUnits('10'),
            swapData,
            USDC.address
        )

        let newUSDCBalance = Number(await USDC.balanceOf(signer.address))
        
        expect(newUSDCBalance).greaterThan(prevUSDCBAL)
    })

    it ("Should swap on Uniswap V3", async function(){
        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8') as ethers.Wallet
        let swap = await deploySwap(ethereum.nativeToken) as Swap

        let USDC =  new ethers.Contract(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            ERC20ABI,
            signer
        )
        let WETH =  new ethers.Contract(
            ethereum.nativeToken,
            ERC20ABI,
            signer
        )

        let prevWETHBAL = Number(await WETH.balanceOf(signer.address))
        // send 10 USDC to swap
        await USDC.transfer(swap.address, 10*10**6)
        let USDC_WETH_V3_POOL = ethers.utils.getAddress('0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640')

        let swapData = await ethereum.getSwapData([{
            tokenIn: USDC.address,
            tokenOut: WETH.address,
            pool: USDC_WETH_V3_POOL
        }])
        
        await swap.connect(signer).swap(
            10*10**6,
            swapData,
            WETH.address
        )

        let newWETHBalance = Number(await WETH.balanceOf(signer.address))
        
        expect(newWETHBalance).greaterThan(prevWETHBAL)


        
    })

})