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
describe("Starlay Liquidation", function() {
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


    it("Should deposit USDC on Starlay, borrow ETH, flashloan ETH on Starlay, liquidate position and repay flashloan successfully using Liquidator, crediting Treasury with protocol fees collected", async function() {

        let signer = await hre.ethers.getImpersonatedSigner('0xDfE4F07D1F36B8d559b25082460a4f6A72531de2')   
        let admin = signer.address
        let treasury = signer.address
        // lending pools that can be used for liquidation
        let approvedLendingPools = [
            '0x90384334333f3356eFDD5b20016350843b90f182' // lendingPool Starlay ETHEREUM
        ]
        let {liquidator, swap} = await deployLiquidator(
            admin,
            treasury,
            approvedLendingPools
        )

        let USDC =  new ethers.Contract(
          '0x6a2d262D56735DbA19Dd70682B39F6bE9a931D98',
          erc20Abi,
          signer
        )
        let WASTR =  new ethers.Contract(
            '0xAeaaf0e2c81Af264101B9129C00F4440cCF0F720',
            erc20Abi,
            signer
        )

        let aUSDC =  new ethers.Contract(
            '0xC404E12D3466acCB625c67dbAb2E1a8a457DEf3c',
            erc20Abi,
            signer
        )

        let aWASTR =  new ethers.Contract(
            '0xc0043Ad81De6DB53a604e42377290EcfD4Bc5fED',
            erc20Abi,
            signer
        )
    
        let lendingPool = new ethers.Contract(
            '0x90384334333f3356eFDD5b20016350843b90f182',
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
            WASTR.address,
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
        // we get swap data for USDC to WASTR
        //function encodeV2Swap(address pool,address tokenIn,bool isToken0)
        let USDC_WASTR_PAIR  = '0xBB1290c1829007F440C771b37718FAbf309cd527'
        let path = await swap.encodeV2Swap(USDC_WASTR_PAIR, USDC.address, true)
        
        let swapData = enco.encode(['uint'], [1]) + path.slice(2,path.length)

        await liquidator.connect(signer).liquidate(
            [
             lendingPool.address, //lendingPool
             '0xbB5893E0f744b3d6305D49B1da6bc04fE922AC15', //priceOracle
             WASTR.address, //debt
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