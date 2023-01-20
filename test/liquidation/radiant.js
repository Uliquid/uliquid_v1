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
describe("Radiant Liquidation", function() {
    async function deployLiquidator(
        admin, //string
        treasury, //string
        approvedLendingPools, //[]
    ) {
        let swap = await deploySwap()
        let Liquidator = await hre.ethers.getContractFactory('RadiantLiquidator')
        let liquidator = await Liquidator.deploy(admin, treasury, swap.address, approvedLendingPools)
        return {
            liquidator, 
            swap
        }
    }


    it("Should deposit USDC on Radiant, borrow ETH, flashloan ETH on Radiant, liquidate position and repay flashloan successfully using Liquidator, crediting Treasury with protocol fees collected", async function() {

        let signer = await hre.ethers.getImpersonatedSigner('0x62383739D68Dd0F844103Db8dFb05a7EdED5BBE6')   
        let admin = signer.address
        let treasury = signer.address
        // lending pools that can be used for liquidation
        let approvedLendingPools = [
            '0x2032b9A8e9F7e76768CA9271003d3e43E1616B1F' // lendingPool Radiant ETHEREUM
        ]
        let {liquidator, swap} = await deployLiquidator(
            admin,
            treasury,
            approvedLendingPools
        )

        let USDC =  new ethers.Contract(
          '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
          erc20Abi,
          signer
        )
        let WETH =  new ethers.Contract(
            '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            erc20Abi,
            signer
        )

        let aUSDC =  new ethers.Contract(
            '0x805ba50001779CeD4f59CfF63aea527D12B94829',
            erc20Abi,
            signer
        )

        let aWETH =  new ethers.Contract(
            '0x15b53d277Af860f51c3E6843F8075007026BBb3a',
            erc20Abi,
            signer
        )
    
        let lendingPool = new ethers.Contract(
            '0x2032b9A8e9F7e76768CA9271003d3e43E1616B1F',
            lendingPoolAbi,
            signer
        )   

        // approve lendingPool to spend 100k USDC
        await USDC.approve(lendingPool.address,100000*10**6)
    
        // DEPOSIT USDC FOR aUSDC
        await lendingPool.deposit(
            USDC.address,
            100000*10**6,
            signer.address,
            0
        )
        
        // BORROW 30ETH
        await lendingPool.borrow(
            WETH.address,
            ethers.utils.parseUnits('30'),
            2,
            0,
            signer.address
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
             '0x795aDa2E75BE36b40aD43e35bdD8253890fd3F79', //priceOracle
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