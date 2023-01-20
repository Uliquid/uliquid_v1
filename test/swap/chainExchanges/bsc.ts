import { assert, expect } from 'chai'
import * as ethers from 'ethers'
import { describe, it } from 'mocha'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'

import bsc from '../../../../src/chainExchanges/chains/bsc'
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



describe("BSC:chainExchanges", function() {
    this.timeout(5000000)

    // FORK BSC MAINNET and run this script
    it("Should get swap data for a Uniswap V2 swap from chainExchange.swapper and execute swap ", async function(){
        let signer = await hre.ethers.getImpersonatedSigner('0xF977814e90dA44bFA03b6295A0616a897441aceC') as ethers.Wallet
        bsc.rpc = signer.provider as any
        swap = await deploySwap(bsc.nativeToken) as Swap
        bsc.setSwapperContract(swap.address)
        bsc.start()
        
        //wait to get all exchange rates on bsc    
        await sleep(30)


        let USDT =  new ethers.Contract(
            '0x55d398326f99059fF775485246999027B3197955',
            ERC20ABI,
            signer
        )
        let WBNB =  new ethers.Contract(
            bsc.nativeToken,
            ERC20ABI,
            signer
        )

        let prevWBNBBAL = Number(await WBNB.balanceOf(signer.address))
        // send 10 USDT to swap
        await USDT.transfer(swap.address, ethers.utils.parseUnits('10'))
        let USDT_WBNB_POOL = ethers.utils.getAddress('0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE')
        let pool = bsc.pools[USDT_WBNB_POOL]
        let swapData = await bsc.getSwapData([{
            tokenIn: USDT.address,
            tokenOut: WBNB.address,
            pool: USDT_WBNB_POOL
        }])
        
        await swap.connect(signer).swap(
            ethers.utils.parseUnits('10'),
            swapData,
            WBNB.address
        )

        let newWBNBBalance = Number(await WBNB.balanceOf(signer.address))
        
        expect(newWBNBBalance).greaterThan(prevWBNBBAL)

    })

    it("Should swap on Ellipsis 3Pool", async function() {
        let signer = await hre.ethers.getImpersonatedSigner('0xF977814e90dA44bFA03b6295A0616a897441aceC') as ethers.Wallet
   
        let USDT =  new ethers.Contract(
            '0x55d398326f99059fF775485246999027B3197955',
            ERC20ABI,
            signer
        )
        let BUSD =  new ethers.Contract(
            '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
            ERC20ABI,
            signer
        )

        let pool = '0x160CAed03795365F3A589f10C379FfA7d75d4E76' //Curve 3pool
        let swapData = await bsc.getSwapData([
            {
                tokenIn: USDT.address,
                tokenOut: BUSD.address,
                pool
            },
        ])
    
        let prevBUSDBAL = Number(await BUSD.balanceOf(signer.address))
        // send 10 USDT to swap
        await USDT.transfer(swap.address, ethers.utils.parseUnits('10'))


        await swap.connect(signer).swap(
            ethers.utils.parseUnits('10'),
            swapData,
            BUSD.address
        )

        let newBUSDBalance = Number(await BUSD.balanceOf(signer.address))
        
        expect(newBUSDBalance).greaterThan(prevBUSDBAL)
    })

    it("Should swap on Ellipsis 2Pool", async function() {
        let signer = await hre.ethers.getImpersonatedSigner('0xF977814e90dA44bFA03b6295A0616a897441aceC') as ethers.Wallet
   
        let BUSD =  new ethers.Contract(
            '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
            ERC20ABI,
            signer
        )
        let USDD =  new ethers.Contract(
            '0xd17479997F34dd9156Deef8F95A52D81D265be9c',
            ERC20ABI,
            signer
        )

        let pool = '0x408A61e158D7BC0CD339BC76917b8Ea04739d473' //Curve 2pool
        let swapData = await bsc.getSwapData([
            {
                tokenIn: BUSD.address,
                tokenOut: USDD.address,
                pool
            },
        ])
    
        let prevUSDDBAL = Number(await USDD.balanceOf(signer.address))
        // send 10 BUSD to swap
        await BUSD.transfer(swap.address, ethers.utils.parseUnits('10'))


        await swap.connect(signer).swap(
            ethers.utils.parseUnits('10'),
            swapData,
            USDD.address
        )

        let newUSDDBalance = Number(await USDD.balanceOf(signer.address))
        
        expect(newUSDDBalance).greaterThan(prevUSDDBAL)
    })

    it("Should swap on  4Pool", async function() {
        let signer = await hre.ethers.getImpersonatedSigner('0xF977814e90dA44bFA03b6295A0616a897441aceC') as ethers.Wallet
   
        let USDT =  new ethers.Contract(
            '0x55d398326f99059fF775485246999027B3197955',
            ERC20ABI,
            signer
        )
        let BUSD =  new ethers.Contract(
            '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
            ERC20ABI,
            signer
        )

        let pool = '0x1B3771a66ee31180906972580adE9b81AFc5fCDc' //4pool
        let swapData = await bsc.getSwapData([
            {
                tokenIn: USDT.address,
                tokenOut: BUSD.address,
                pool
            },
        ])
    
        let prevBUSDBAL = Number(await BUSD.balanceOf(signer.address))
        // send 10 USDT to swap
        await USDT.transfer(swap.address, ethers.utils.parseUnits('10'))


        await swap.connect(signer).swap(
            ethers.utils.parseUnits('10'),
            swapData,
            BUSD.address
        )

        let newBUSDBalance = Number(await BUSD.balanceOf(signer.address))
        
        expect(newBUSDBalance).greaterThan(prevBUSDBAL)
    })


})