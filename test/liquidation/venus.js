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
describe("Venus Liquidation", function() {
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

    it("Test vETH repayBorrowBehalf: Should deposit USDT on Venus, borrow WBNB, flashloan WBNB on UNISWAP V2 Pair,\
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

        let vUSDT =  new ethers.Contract(
            '0xfD5840Cd36d94D7229439859C0112a4185BC0255',
            cTokenABI,
            signer
        )

        let vBNB =  new ethers.Contract(
            '0xA07c5b74C9B40447a954e1466938b865b6BBea36',
            cTokenABI,
            signer
        )
    
        let lendingPool = new ethers.Contract(
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
            lendingPoolAbi,
            signer
        )   

        let comptroller = new ethers.Contract(
            '0xfD36E2c2a6789Db23113685031d7F16329158384',
            comptrollerABI,
            signer
        )
        
        // enter vUSDT vBNB markets 
        await comptroller.enterMarkets([vUSDT.address, vBNB.address])
        .catch(console.log)
        // approve vUSDT (decimals is 18 for USDT on BSC)
        await USDT.approve(vUSDT.address, ethers.utils.parseUnits('30000'))
        
        // deposit collateral
        await vUSDT.mint(
            ethers.utils.parseUnits('30000')
        )
        
        // borrow BNB
        await vBNB.borrow(
            ethers.utils.parseUnits('30'),
        )
      
        let prevAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let prevTreasuryBalance = await USDT.balanceOf(treasury)

        await vUSDT.approve(liquidator.address, vUSDT.balanceOf(signer.address))

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
                


                '0xd8B6dA2bfEC71D684D3E2a2FC9492dDad5C3787F', //priceOracle
                vBNB.address,
                vUSDT.address,
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
    it("Test cToken repayBorrowBehalf: Should deposit USDT on Venus, borrow WBTC, flashloan WBTC on UNISWAP V2 USDT-WBTC Pair,\
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

        let vUSDT =  new ethers.Contract(
            '0xfD5840Cd36d94D7229439859C0112a4185BC0255',
            cTokenABI,
            signer
        )

        let vWBTC =  new ethers.Contract(
            '0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B',
            cTokenABI,
            signer
        )

        let lendingPool = new ethers.Contract(
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
            lendingPoolAbi,
            signer
        )   

        let comptroller = new ethers.Contract(
            '0xfD36E2c2a6789Db23113685031d7F16329158384',
            comptrollerABI,
            signer
        )
        
        // enter vUSDT vBNB markets 
        await comptroller.enterMarkets([vUSDT.address, vWBTC.address])
        .catch(console.log)
        // approve vUSDT (decimals is 18 for USDT on BSC)
        await USDT.approve(vUSDT.address, ethers.utils.parseUnits('30000'))
        
        // deposit collateral
        await vUSDT.mint(
            ethers.utils.parseUnits('30000')
        )
        
        // borrow BNB
        await vWBTC.borrow(
            ethers.utils.parseUnits('1'),
        )
        
        let prevAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let prevTreasuryBalance = await USDT.balanceOf(treasury)

        await vUSDT.approve(liquidator.address, vUSDT.balanceOf(signer.address))

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
                


                '0xd8B6dA2bfEC71D684D3E2a2FC9492dDad5C3787F', //priceOracle
                vWBTC.address,
                vUSDT.address,
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

it("Test cToken repayBorrowBehalf: Should deposit USDT on Venus, borrow WBTC, flashloan WBTC on UNISWAP V2 BUSD-WBTC Pair,\
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

   let vUSDT =  new ethers.Contract(
       '0xfD5840Cd36d94D7229439859C0112a4185BC0255',
       cTokenABI,
       signer
   )

   let vWBTC =  new ethers.Contract(
       '0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B',
       cTokenABI,
       signer
   )

   let lendingPool = new ethers.Contract(
       '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
       lendingPoolAbi,
       signer
   )   

   let comptroller = new ethers.Contract(
       '0xfD36E2c2a6789Db23113685031d7F16329158384',
       comptrollerABI,
       signer
   )
   
   // enter vUSDT vBNB markets 
   await comptroller.enterMarkets([vUSDT.address, vWBTC.address])
   .catch(console.log)
   // approve vUSDT (decimals is 18 for USDT on BSC)
   await USDT.approve(vUSDT.address, ethers.utils.parseUnits('50000'))
   
   // deposit collateral
   await vUSDT.mint(
       ethers.utils.parseUnits('50000')
   )
  
   // borrow BNB
   await vWBTC.borrow(
       ethers.utils.parseUnits('1.5'),
   )
 
   let prevAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
   let prevTreasuryBalance = await USDT.balanceOf(treasury)

   await vUSDT.approve(liquidator.address, vUSDT.balanceOf(signer.address))

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
           


           '0xd8B6dA2bfEC71D684D3E2a2FC9492dDad5C3787F', //priceOracle
           vWBTC.address,
           vUSDT.address,
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

it("Test cToken repayBorrowBehalf: Should deposit USDT on Venus, borrow USDT, flashloan USDT on UNISWAP V2 Pair,\
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

   let vUSDT =  new ethers.Contract(
       '0xfD5840Cd36d94D7229439859C0112a4185BC0255',
       cTokenABI,
       signer
   )

   let vBNB =  new ethers.Contract(
       '0xA07c5b74C9B40447a954e1466938b865b6BBea36',
       cTokenABI,
       signer
   )

   let lendingPool = new ethers.Contract(
       '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
       lendingPoolAbi,
       signer
   )   

   let comptroller = new ethers.Contract(
       '0xfD36E2c2a6789Db23113685031d7F16329158384',
       comptrollerABI,
       signer
   )
   
   // enter vUSDT vBNB markets 
   await comptroller.enterMarkets([vUSDT.address, vBNB.address])
   .catch(console.log)
   // approve vUSDT (decimals is 18 for USDT on BSC)
   await USDT.approve(vUSDT.address, ethers.utils.parseUnits('30000'))
   
   // deposit collateral
   await vUSDT.mint(
       ethers.utils.parseUnits('30000')
   )
   
   // borrow BNB
   await vUSDT.borrow(
       ethers.utils.parseUnits('20000'),
   )
 
   let prevAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
   let prevTreasuryBalance = await USDT.balanceOf(treasury)

   await vUSDT.approve(liquidator.address, vUSDT.balanceOf(signer.address))

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
           
           '0xd8B6dA2bfEC71D684D3E2a2FC9492dDad5C3787F', //priceOracle
           vUSDT.address,
           vUSDT.address,
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