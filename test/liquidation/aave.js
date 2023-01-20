const {
    time,
    loadFixture,
  } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const hre = require("hardhat");
const enco = new ethers.utils.AbiCoder();

const erc20Abi = require('../../abi/erc20.json');
const lendingPoolAbi = require('../../abi/aaveLendingPool.json')
const {deploySwap} = require('../swap/deploySwap')

// PASSED TESTS ON BLOCK 15812600 ETH
describe("Aave Liquidation", function() {
    async function deployLiquidator(
        admin, //string
        treasury, //string
        approvedLendingPools, //[]
    ) {
        let swap = await deploySwap()
        let Liquidator = await hre.ethers.getContractFactory('AaveLiquidator')
        let liquidator = await Liquidator.deploy(admin, treasury, swap.address, approvedLendingPools)
        return {
            liquidator, 
            swap
        }
    }


    it("Should deposit USDC on Aave, borrow ETH, flashloan ETH on Aave, liquidate position and repay flashloan successfully using Liquidator, crediting Treasury with protocol fees collected", async function() {

        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8')   
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

        let USDC =  new ethers.Contract(
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          erc20Abi,
          signer
        )
        let WETH =  new ethers.Contract(
            '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            erc20Abi,
            signer
        )

        let aUSDC =  new ethers.Contract(
            '0xBcca60bB61934080951369a648Fb03DF4F96263C',
            erc20Abi,
            signer
        )

        let aWETH =  new ethers.Contract(
            '0x030bA81f1c18d280636F32af80b9AAd02Cf0854e',
            erc20Abi,
            signer
        )
    
        let lendingPool = new ethers.Contract(
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
            lendingPoolAbi,
            signer
        )   

        // approve lendingPool to spend 100k USDC
        await USDC.approve(lendingPool.address,100000*10**6)
    
        // DEPOSIT USDC FOR aUSDC
        await lendingPool.deposit(
            USDC.address,
            100000*10**6,
            '0x55FE002aefF02F77364de339a1292923A15844B8',
            0
        )
        
        // BORROW 30ETH
        await lendingPool.borrow(
            WETH.address,
            ethers.utils.parseUnits('30'),
            2,
            0,
            '0x55FE002aefF02F77364de339a1292923A15844B8'
        )

        let userData = await lendingPool.getUserAccountData(signer.address)
        let prevTotalDebtETH = userData.totalDebtETH

        let prevTreasuryBalance = await USDC.balanceOf(treasury)
       
        // approve liquidator to spend signer's aUSDC 
        await aUSDC.approve(liquidator.address, aUSDC.balanceOf(signer.address))
    
        // encode swap data
        // we get swap data for USDC to WETH
        //function encodeV2Swap(address pool,address tokenIn,bool isToken0)
        let USDC_WETH_PAIR  = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc'
        let path = await swap.encodeV2Swap(USDC_WETH_PAIR, USDC.address, true)
        
        let swapData = enco.encode(['uint'], [1]) + path.slice(2,path.length)

        await liquidator.connect(signer).liquidate(
            [
             lendingPool.address, //lendingPool
             '0xA50ba011c48153De246E5192C8f9258A2ba79Ca9', //priceOracle
             WETH.address, //debt
             USDC.address, //collateral
             aUSDC.address, //aTokenCollateral
             ethers.utils.parseUnits('30'), //debtAmount
             0, //stableDebtAmount
             ethers.utils.parseUnits('30'), //variableDebtAmount
             await aUSDC.balanceOf(signer.address), //collateralAmount
             18, // debtDecimals
             6, // collateralDecimals
             20000, //feePlusSlippage  = % * 1000000
             ethers.utils.parseUnits('30'), // minSwapOut
             swapData
            ]
         ,{gasLimit:5000000})
         .catch(e=>e)

        userData = await lendingPool.getUserAccountData(signer.address)
        let newTotalDebtETH = userData.totalDebtETH
        
        let newTreasuryBalance = await USDC.balanceOf(treasury)

        expect(newTotalDebtETH).lessThan(prevTotalDebtETH, "Failed to liquidate borrow")
        expect(newTreasuryBalance).greaterThan(prevTreasuryBalance, "Failed to credit treasury")
    })

})