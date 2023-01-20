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
const comptrollerABI = require('../../abi/comptroller.json')
const cTokenABI = require('../../abi/cToken.json')

const {deploySwap} = require('../swap/deploySwap')

// PASSED TESTS ON BLOCK 15812600 ETHEREUM
describe("Compound Liquidation", function() {
    async function deployLiquidator(
        admin, //string
        treasury, //string
        approvedLendingPools, //[]
    ) {
        let WETH  = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
        let swap = await deploySwap(WETH)

        let Liquidator = await hre.ethers.getContractFactory('CompoundLiquidator')
        let liquidator = await Liquidator.deploy(admin, treasury, swap.address, WETH, approvedLendingPools)
        return {
            liquidator, 
            swap
        }
    }


    it("Should deposit USDC on Compound, borrow ETH, flashloan ETH on Aave, liquidate position, repay flashloan successfully and liquidate position successfully using Liquidator, crediting Treasury with protocol fees collected", async function() {
    
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

        let cUSDC =  new ethers.Contract(
            '0x39AA39c021dfbaE8faC545936693aC917d5E7563',
            cTokenABI,
            signer
        )

        let cETH =  new ethers.Contract(
            '0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5',
            cTokenABI,
            signer
        )
    
        let lendingPool = new ethers.Contract(
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
            lendingPoolAbi,
            signer
        )   

        let comptroller = new ethers.Contract(
            '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
            comptrollerABI,
            signer
        )
        
        // enter cUSDC cETH markets 
        await comptroller.enterMarkets([cUSDC.address, cETH.address])
        // approve cUSDC
        await USDC.approve(cUSDC.address,200000*10**6)
        
        // deposit collateral
        await cUSDC.mint(
            200000*10**6,
        )
        // borrow ETH
        await cETH.borrow(
            ethers.utils.parseUnits('30'),
        )


        let prevAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let prevTreasuryBalance = await USDC.balanceOf(treasury)

        await cUSDC.approve(liquidator.address, cUSDC.balanceOf(signer.address))

        // encode swap data
        // we get swap data for USDC to WETH
        //function encodeV2Swap(address pool,address tokenIn,bool isToken0)
        let USDC_WETH_PAIR  = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc'
        let path = await swap.encodeV2Swap(USDC_WETH_PAIR, USDC.address, true)
        
        let swapData = enco.encode(['uint'], [1]) + path.slice(2,path.length)
        
        await liquidator.connect(signer).liquidate(
            [
             lendingPool.address, //lendingPool
             '0x65c816077C29b557BEE980ae3cC2dCE80204A0C5', //priceOracle
             cETH.address,
             cUSDC.address,
             WETH.address,
             USDC.address,
             ethers.utils.parseUnits('30'),
             200000*10**6,
             0,
             8,
             20000, //feePlusSlippage
             ethers.utils.parseUnits('30'), // minSwapOut
             swapData
            ]
         ,{gasLimit: 5000000, gasPrice: 100*10**9})

        let newAccountLiquidity = (await comptroller.getAccountLiquidity(signer.address))[1]
        let newTreasuryBalance = await USDC.balanceOf(treasury)

        expect(newAccountLiquidity).greaterThan(prevAccountLiquidity, "Failed to liquidate borrow")
        expect(newTreasuryBalance).greaterThan(prevTreasuryBalance, "Failed to credit treasury")


    })


})