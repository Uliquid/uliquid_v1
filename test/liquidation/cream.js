const {
    time,
    loadFixture,
  } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const hre = require("hardhat");


const erc20Abi = require('../../abi/erc20.json');
const lendingPoolAbi = require('../../abi/aaveLendingPool.json')
const comptrollerABI = require('../../abi/comptroller.json')
const cTokenABI = require('../../abi/cToken.json')

const {deploySwap} = require('../swap/deploySwap');
const { ethers } = require("ethers");
const enco = new ethers.utils.AbiCoder();

let rpc = "https://rpc.ankr.com/bsc"
// PASSED TESTS ON BLOCK  - BSC
describe("Cream Liquidation", function() {
    this.timeout(500000)
    async function deployLiquidator(
        admin, //string
        treasury, //string
        approvedLendingPools, //[]
    ) {
        let WBNB  = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
        let swap = await deploySwap(WBNB)

        let Liquidator = await hre.ethers.getContractFactory('CompoundLiquidator')
        let liquidator = await Liquidator.deploy(admin, treasury, swap.address, WBNB, approvedLendingPools)
        return {
            liquidator, 
            swap
        }
    }

    
    it("Test cETH repayBorrowBehalf: Should deposit USDT on Cream Finance, borrow WBNB, flashloan WBNB on UNISWAP V2 Pair,\
         liquidate position, repay flashloan successfully using Liquidator, crediting Treasury with protocol fees collected", async function() {
        (await hre.ethers.getSigner()).sendTransaction({
            to: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
            data: '0x',
            value: hre.ethers.utils.parseUnits('2')
        })
        let signer = await hre.ethers.getImpersonatedSigner('0xF977814e90dA44bFA03b6295A0616a897441aceC')   
       
        let admin = signer.address
        let treasury = signer.address
        // lending pools that can be used for liquidation
        let approvedLendingPools = [
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9' // lendingPool Aave ETHEREUM
        ]
        let {liquidator, swap} = await deployLiquidator(
            admin,
            treasury,
            approvedLendingPools
        )
        

        let USDT =  new ethers.Contract(
            '0x55d398326f99059fF775485246999027B3197955',
            erc20Abi,
            signer
        )
        let WBNB =  new ethers.Contract(
            '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            erc20Abi,
            signer
        )

        let crUSDT =  new ethers.Contract(
            '0xEF6d459FE81C3Ed53d292c936b2df5a8084975De',
            cTokenABI,
            signer
        )

        let crBNB =  new ethers.Contract(
            '0x1Ffe17B99b439bE0aFC831239dDECda2A790fF3A',
            cTokenABI,
            signer
        )
    
        let lendingPool = new ethers.Contract(
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
            lendingPoolAbi,
            signer
        )   

        let comptroller = new ethers.Contract(
            '0x589DE0F0Ccf905477646599bb3E5C622C84cC0BA',
            comptrollerABI,
            signer
        )
        
        // enter crUSDT crBNB markets 
        await comptroller.enterMarkets([crUSDT.address, crBNB.address])
        .catch(console.log)
        // approve crUSDT (decimals is 18 for USDT on BSC)
        await USDT.approve(crUSDT.address, ethers.utils.parseUnits('30000'))
        
        // deposit collateral
        await crUSDT.mint(
            ethers.utils.parseUnits('30000')
        )
        
        // borrow BNB
        await crBNB.borrow(
            ethers.utils.parseUnits('30'),
        )
      
        let prevAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let prevTreasuryBalance = await USDT.balanceOf(treasury)

        await crUSDT.approve(liquidator.address, crUSDT.balanceOf(signer.address))

        // encode swap data
        // we get swap data for USDT to WBNB
        //function encodeV2Swap(address pool,address tokenIn,bool isToken0)
        let USDT_WBNB_PAIR  = '0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE'
        
        // we don't need to make a collateral swap in this case
        let swapData = '0x'
        
        await liquidator.connect(signer).v2Liquidate(
            [
                USDT_WBNB_PAIR,
                false,
                USDT.address,
                


                '0x913B6e507bb1253150433e49a18791C6292A3D7c', //priceOracle
                crBNB.address,
                crUSDT.address,
                WBNB.address,
                USDT.address,
                ethers.utils.parseUnits('30'),
                ethers.utils.parseUnits('30000'),
                0,
                8,
                20000, //feePlusSlippage
                ethers.utils.parseUnits('30'), // minSwapOut
                swapData
            ]
         ,{gasLimit: 5000000, gasPrice: 100*10**9})

        let newAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let newTreasuryBalance = await USDT.balanceOf(treasury)

        expect(newAccountLiquidity).greaterThan(prevAccountLiquidity, "Failed to liquidate borrow")
        expect(newTreasuryBalance).greaterThan(prevTreasuryBalance, "Failed to credit treasury")

        await hre.network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                  forking: {
                    jsonRpcUrl: rpc
                  
                  },
                },
              ]
        })
        

    })

    
    it("Test cToken repayBorrowBehalf: Should deposit USDT on Cream Finance, borrow WBTC, flashloan WBTC on UNISWAP V2 USDT-WBTC Pair,\
         liquidate position, repay flashloan successfully using Liquidator, crediting Treasury with protocol fees collected", async function() {
        (await hre.ethers.getSigner()).sendTransaction({
            to: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
            data: '0x',
            value: hre.ethers.utils.parseUnits('2')
        })
        let signer = await hre.ethers.getImpersonatedSigner('0xF977814e90dA44bFA03b6295A0616a897441aceC')   
       
        let admin = signer.address
        let treasury = signer.address
        // lending pools that can be used for liquidation
        let approvedLendingPools = [
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9' // lendingPool Aave ETHEREUM
        ]
        let {liquidator, swap} = await deployLiquidator(
            admin,
            treasury,
            approvedLendingPools
        )
        

        let USDT =  new ethers.Contract(
            '0x55d398326f99059fF775485246999027B3197955',
            erc20Abi,
            signer
        )
        let WBTC =  new ethers.Contract(
            '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
            erc20Abi,
            signer
        )

        let crUSDT =  new ethers.Contract(
            '0xEF6d459FE81C3Ed53d292c936b2df5a8084975De',
            cTokenABI,
            signer
        )

        let crWBTC =  new ethers.Contract(
            '0x11883Cdea6bAb720092791cc89affa54428Ce069',
            cTokenABI,
            signer
        )
    
        let lendingPool = new ethers.Contract(
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
            lendingPoolAbi,
            signer
        )   

        let comptroller = new ethers.Contract(
            '0x589DE0F0Ccf905477646599bb3E5C622C84cC0BA',
            comptrollerABI,
            signer
        )
        
        // enter crUSDT crBNB markets 
        await comptroller.enterMarkets([crUSDT.address, crWBTC.address])
        .catch(console.log)
        // approve crUSDT (decimals is 18 for USDT on BSC)
        await USDT.approve(crUSDT.address, ethers.utils.parseUnits('30000'))
        
        // deposit collateral
        await crUSDT.mint(
            ethers.utils.parseUnits('30000')
        )
       
        // borrow BNB
        await crWBTC.borrow(
            ethers.utils.parseUnits('1'),
        )
      
        let prevAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let prevTreasuryBalance = await USDT.balanceOf(treasury)

        await crUSDT.approve(liquidator.address, crUSDT.balanceOf(signer.address))

        // encode swap data
        // we get swap data for USDT to WBTC
        //function encodeV2Swap(address pool,address tokenIn,bool isToken0)
        let USDT_WBTC_PAIR  = '0xa987f0b7098585c735cD943ee07544a84e923d1D'
        // we don't need to make a collateral swap in this case
        let swapData = '0x'
        
        await liquidator.connect(signer).v2Liquidate(
            [
                USDT_WBTC_PAIR,
                false,
                USDT.address,
                


                '0x913B6e507bb1253150433e49a18791C6292A3D7c', //priceOracle
                crWBTC.address,
                crUSDT.address,
                WBTC.address,
                USDT.address,
                ethers.utils.parseUnits('1'),
                ethers.utils.parseUnits('30000'),
                0,
                8,
                20000, //feePlusSlippage
                ethers.utils.parseUnits('1'), // minSwapOut
                swapData
            ]
         ,{gasLimit: 5000000, gasPrice: 100*10**9})

        let newAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let newTreasuryBalance = await USDT.balanceOf(treasury)

        expect(newAccountLiquidity).greaterThan(prevAccountLiquidity, "Failed to liquidate borrow")
        expect(newTreasuryBalance).greaterThan(prevTreasuryBalance, "Failed to credit treasury")

        await hre.network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                  forking: {
                    jsonRpcUrl: rpc
                  
                  },
                },
              ]
        })

    })
    
    it("Test cToken repayBorrowBehalf: Should deposit USDT on Cream Finance, borrow WBTC, flashloan WBTC on UNISWAP V2 BUSD-WBTC Pair,\
         liquidate position, repay flashloan successfully using Liquidator, crediting Treasury with protocol fees collected", async function() {
        (await hre.ethers.getSigner()).sendTransaction({
            to: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
            data: '0x',
            value: hre.ethers.utils.parseUnits('2')
        })
        let signer = await hre.ethers.getImpersonatedSigner('0xF977814e90dA44bFA03b6295A0616a897441aceC')   
       
        let admin = signer.address
        let treasury = signer.address
        // lending pools that can be used for liquidation
        let approvedLendingPools = [
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9' // lendingPool Aave ETHEREUM
        ]
        let {liquidator, swap} = await deployLiquidator(
            admin,
            treasury,
            approvedLendingPools
        )
        

        let USDT =  new ethers.Contract(
            '0x55d398326f99059fF775485246999027B3197955',
            erc20Abi,
            signer
        )
        let WBTC =  new ethers.Contract(
            '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
            erc20Abi,
            signer
        )

        let crUSDT =  new ethers.Contract(
            '0xEF6d459FE81C3Ed53d292c936b2df5a8084975De',
            cTokenABI,
            signer
        )

        let crWBTC =  new ethers.Contract(
            '0x11883Cdea6bAb720092791cc89affa54428Ce069',
            cTokenABI,
            signer
        )
    
        let lendingPool = new ethers.Contract(
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
            lendingPoolAbi,
            signer
        )   

        let comptroller = new ethers.Contract(
            '0x589DE0F0Ccf905477646599bb3E5C622C84cC0BA',
            comptrollerABI,
            signer
        )
        
        // enter crUSDT crBNB markets 
        await comptroller.enterMarkets([crUSDT.address, crWBTC.address])
        .catch(console.log)
        // approve crUSDT (decimals is 18 for USDT on BSC)
        await USDT.approve(crUSDT.address, ethers.utils.parseUnits('50000'))
        
        // deposit collateral
        await crUSDT.mint(
            ethers.utils.parseUnits('50000')
        )
       
        // borrow BNB
        await crWBTC.borrow(
            ethers.utils.parseUnits('1.5'),
        )
      
        let prevAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let prevTreasuryBalance = await USDT.balanceOf(treasury)

        await crUSDT.approve(liquidator.address, crUSDT.balanceOf(signer.address))

        // encode swap data
        // we get swap data for USDT to WBTC
        //function encodeV2Swap(address pool,address tokenIn,bool isToken0)
        let BUSD_WBTC_PAIR = '0xF45cd219aEF8618A92BAa7aD848364a158a24F33'
        let BUSD_USDT_PAIR = '0x7EFaEf62fDdCCa950418312c6C91Aef321375A00'

        let BUSD = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56'
        let flashloanPool = BUSD_WBTC_PAIR
        let repayToken = BUSD 
        let feePlusSlippage = 40000 // 4%
        let path = await swap.encodeV2Swap(BUSD_USDT_PAIR, USDT.address, true)
        let swapData = enco.encode(['uint'], [1]) + path.slice(2,path.length)

        
        await liquidator.connect(signer).v2Liquidate(
            [
                flashloanPool,
                true,
                repayToken,
                


                '0x913B6e507bb1253150433e49a18791C6292A3D7c', //priceOracle
                crWBTC.address,
                crUSDT.address,
                WBTC.address,
                USDT.address,
                ethers.utils.parseUnits('1.5'),
                ethers.utils.parseUnits('50000'),
                0,
                8,
                feePlusSlippage,
                ethers.utils.parseUnits('1.5'), // minSwapOut
                swapData
            ]
         ,{gasLimit: 5000000, gasPrice: 100*10**9})

        let newAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let newTreasuryBalance = await USDT.balanceOf(treasury)

        expect(newAccountLiquidity).greaterThan(prevAccountLiquidity, "Failed to liquidate borrow")
        expect(newTreasuryBalance).greaterThan(prevTreasuryBalance, "Failed to credit treasury")

        await hre.network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                  forking: {
                    jsonRpcUrl: rpc
                  
                  },
                },
              ]
        })
        

    })
    
    it("Test cToken repayBorrowBehalf: Should deposit USDT on Cream Finance, borrow USDT, flashloan USDT on UNISWAP V2 Pair,\
         liquidate position, repay flashloan successfully using Liquidator, crediting Treasury with protocol fees collected", async function() {
        (await hre.ethers.getSigner()).sendTransaction({
            to: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
            data: '0x',
            value: hre.ethers.utils.parseUnits('2')
        })
        let signer = await hre.ethers.getImpersonatedSigner('0xF977814e90dA44bFA03b6295A0616a897441aceC')   
       
        let admin = signer.address
        let treasury = signer.address
        // lending pools that can be used for liquidation
        let approvedLendingPools = [
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9' // lendingPool Aave ETHEREUM
        ]
        let {liquidator, swap} = await deployLiquidator(
            admin,
            treasury,
            approvedLendingPools
        )
        

        let USDT =  new ethers.Contract(
            '0x55d398326f99059fF775485246999027B3197955',
            erc20Abi,
            signer
        )
        let WBNB =  new ethers.Contract(
            '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            erc20Abi,
            signer
        )

        let crUSDT =  new ethers.Contract(
            '0xEF6d459FE81C3Ed53d292c936b2df5a8084975De',
            cTokenABI,
            signer
        )

        let crBNB =  new ethers.Contract(
            '0x1Ffe17B99b439bE0aFC831239dDECda2A790fF3A',
            cTokenABI,
            signer
        )
    
        let lendingPool = new ethers.Contract(
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
            lendingPoolAbi,
            signer
        )   

        let comptroller = new ethers.Contract(
            '0x589DE0F0Ccf905477646599bb3E5C622C84cC0BA',
            comptrollerABI,
            signer
        )
        
        // enter crUSDT crBNB markets 
        await comptroller.enterMarkets([crUSDT.address, crBNB.address])
        .catch(console.log)
        // approve crUSDT (decimals is 18 for USDT on BSC)
        await USDT.approve(crUSDT.address, ethers.utils.parseUnits('30000'))
        
        // deposit collateral
        await crUSDT.mint(
            ethers.utils.parseUnits('30000')
        )
        
        // borrow BNB
        await crUSDT.borrow(
            ethers.utils.parseUnits('20000'),
        )
      
        let prevAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let prevTreasuryBalance = await USDT.balanceOf(treasury)

        await crUSDT.approve(liquidator.address, crUSDT.balanceOf(signer.address))

        // encode swap data
        // we get swap data for USDT to WBNB
        //function encodeV2Swap(address pool,address tokenIn,bool isToken0)
        let USDT_WBNB_PAIR  = '0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE'
        
        // we don't need to make a collateral swap in this case
        let swapData = '0x'
        
        await liquidator.connect(signer).v2Liquidate(
            [
                USDT_WBNB_PAIR,
                true,
                USDT.address,
                
                '0x913B6e507bb1253150433e49a18791C6292A3D7c', //priceOracle
                crUSDT.address,
                crUSDT.address,
                USDT.address,
                USDT.address,
                ethers.utils.parseUnits('20000'),
                ethers.utils.parseUnits('30000'),
                0,
                8,
                30000, //feePlusSlippage
                ethers.utils.parseUnits('20000'), // minSwapOut
                swapData
            ]
         ,{gasLimit: 5000000, gasPrice: 100*10**9})

        let newAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let newTreasuryBalance = await USDT.balanceOf(treasury)

        expect(newAccountLiquidity).greaterThan(prevAccountLiquidity, "Failed to liquidate borrow")
        expect(newTreasuryBalance).greaterThan(prevTreasuryBalance, "Failed to credit treasury")

        await hre.network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                  forking: {
                    jsonRpcUrl: rpc
                  
                  },
                },
              ]
        })
        

    })

})