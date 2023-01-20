import { assert, expect } from 'chai'
import { ethers } from 'ethers'
import { describe, it } from 'mocha'
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers'

import polygon from '../../../../src/chainExchanges/chains/polygon'
import {Swap} from '../../../typechain-types'
import {sleep} from '../../../../src/utils'


import ERC20ABI from '../../../abi/erc20.json'

const hre = require('hardhat')
const {deploySwap} = require('../deploySwap')

polygon.start()
describe("Polygon:chainExchanges", function() {

    this.timeout(5000000)
    // FORK POLYGON MAINNET and run this script
    it("Should swap on a Uniswap V2 Pair", async function(){
        await sleep(30)
        let signer = await hre.ethers.getImpersonatedSigner('0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245') as ethers.Wallet
        let swap = await deploySwap(polygon.nativeToken) as Swap
        console.log(swap.address)
        let USDC =  new ethers.Contract(
            '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            ERC20ABI,
            signer
        )
        let WETH =  new ethers.Contract(
            '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
            ERC20ABI,
            signer
        )

        let prevWETHBAL = Number(await WETH.balanceOf(signer.address))
        // send 10 USDC to swap
        await USDC.transfer(swap.address, 10*10**6)
        let USDC_WETH_POOL = ethers.utils.getAddress('0x853ee4b2a13f8a742d64c8f088be7ba2131f670d')
        let pool = polygon.pools[USDC_WETH_POOL]
        let swapData = await polygon.getSwapData([{
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

    it("Should swap on Curve 3Pool ATokens", async function() {
        let signer = await hre.ethers.getImpersonatedSigner('0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245') as ethers.Wallet
        let swap = await deploySwap(polygon.nativeToken) as Swap
       
        let USDC =  new ethers.Contract(
            '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            ERC20ABI,
            signer
        )
        let DAI =  new ethers.Contract(
            '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
            ERC20ABI,
            signer
        )

        let pool = '0x445FE580eF8d70FF569aB36e80c647af338db351' //Curve aTokens pool
        let swapData = await polygon.getSwapData([
            {
                tokenIn: USDC.address,
                tokenOut: '0x1a13F4Ca1d028320A707D99520AbFefca3998b7F',
                pool
            },
            {
                tokenIn: '0x1a13F4Ca1d028320A707D99520AbFefca3998b7F',
                tokenOut: '0x27F8D03b3a2196956ED754baDc28D73be8830A6e',
                pool
            },
            {
                tokenIn: '0x27F8D03b3a2196956ED754baDc28D73be8830A6e',
                tokenOut: DAI.address,
                pool
            }
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

    it("Should swap on Curve Lp-ATokens Pool", async function() {
        let signer = await hre.ethers.getImpersonatedSigner('0x25864a712C80d33Ba1ad7c23CffA18b46F2fc00c') as ethers.Wallet
        let swap = await deploySwap(polygon.nativeToken) as Swap

        let USDC =  new ethers.Contract(
            '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            ERC20ABI,
            signer
        )
        let miMatic =  new ethers.Contract(
            '0xa3Fa99A148fA48D14Ed51d610c367C61876997F1',
            ERC20ABI,
            signer
        )

        let pool = '0x447646e84498552e62eCF097Cc305eaBFFF09308'
        let swapData = await polygon.getSwapData([
            {
                tokenIn: miMatic.address,
                tokenOut: '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171',
                pool
            },
            {
                tokenIn: '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171',
                tokenOut: '0x1a13F4Ca1d028320A707D99520AbFefca3998b7F',
                pool
            },
            {
                tokenIn: '0x1a13F4Ca1d028320A707D99520AbFefca3998b7F',
                tokenOut: USDC.address,
                pool:'0x445FE580eF8d70FF569aB36e80c647af338db351'
            },
        ])
    
        let prevUSDCBAL = Number(await USDC.balanceOf(signer.address))
        // send 10 USDC to swap
        await miMatic.transfer(swap.address, ethers.utils.parseUnits('1'))


        await swap.connect(signer).swap(
            ethers.utils.parseUnits('1'),
            swapData,
            USDC.address
        )

        let newUSDCBalance = Number(await USDC.balanceOf(signer.address))
        
        expect(newUSDCBalance).greaterThan(prevUSDCBAL)
    })

    it ("Should swap on Uniswap V3", async function(){
        let signer = await hre.ethers.getImpersonatedSigner('0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245') as ethers.Wallet
        let swap = await deploySwap(polygon.nativeToken) as Swap

        let USDC =  new ethers.Contract(
            '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            ERC20ABI,
            signer
        )  

        let WETH =  new ethers.Contract(
            '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
            ERC20ABI,
            signer
        )

        let prevWETHBAL = Number(await WETH.balanceOf(signer.address))
        // send 10 USDC to swap
        await USDC.transfer(swap.address, 10*10**6)
        let USDC_WETH_V3_POOL = ethers.utils.getAddress('0x45dDa9cb7c25131DF268515131f647d726f50608')

        let swapData = await polygon.getSwapData([{
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

