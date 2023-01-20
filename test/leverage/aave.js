const {
    time,
    loadFixture,
  } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const hre = require("hardhat");
const enco = new ethers.utils.AbiCoder();

const erc20Abi = require('../../abi/erc20.json');
const aTokensABI     = require('../../abi/aTokens.json')
const lendingPoolAbi = require('../../abi/aaveLendingPool.json')
const aavePriceOracleABI = require('../../abi/aavePriceOracle.json')
const {deploySwap} = require('../swap/deploySwap')

// PASSED TESTS ON BLOCK 15812600 ETH

function getLeveragedPosition(
    collateralAmount, 
    collateralValue, 
    debtAmount, 
    debtValue, 
    collateralizationRatio, // in percentage
    swapMinIn=0.1, // min amount that can be swapped from debt back to collateral
    maxLoops=10,
    loops=0,
    actualCollateral=0,
    actualDebt=0,
    swapFee=0.3/100,
   
) {
    debtAmount = collateralAmount * collateralValue / debtValue * 1 / (collateralizationRatio/100)
  
    if (loops < maxLoops)
        if (debtAmount > swapMinIn) {
            actualCollateral += collateralAmount
            actualDebt += debtAmount
            loops += 1
            collateralAmount = debtAmount * debtValue / collateralValue;
            collateralAmount -= swapFee * collateralAmount; 

            [actualCollateral, actualDebt, collateralAmount, debtAmount, loops] = getLeveragedPosition(
                collateralAmount,
                collateralValue,
                debtAmount,
                debtValue,
                collateralizationRatio,
                swapMinIn,
                maxLoops,
                loops,
                actualCollateral,
                actualDebt,
                swapFee
            )
        } 
    
    return [actualCollateral, actualDebt, collateralAmount, debtAmount, loops]
}

describe("Aave Liquidation", function() {
    this.timeout(500000)
    async function deployLiquidator(
        admin, //string
        approvedLendingPools, //[]
    ) {
        let swap = await deploySwap()
        let Leverage = await hre.ethers.getContractFactory('AaveLeverage')
        let leverager = await Leverage.deploy(admin, swap.address, approvedLendingPools)
        return {
            leverager, 
            swap
        }
    }


    it("Should Short ETH with USDC as Collateral", async function() {
        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8')   
        let admin = signer.address
       

        // lending pools that can be used for liquidation
        let approvedLendingPools = [
            '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9' // lendingPool Aave ETHEREUM
        ]
        let {leverager, swap} = await deployLiquidator(
            admin,
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


        let vdWETH = new ethers.Contract(
                '0xF63B34710400CAd3e044cFfDcAb00a0f32E33eCf',
                aTokensABI,
                signer
            )

        let lendingPool = new ethers.Contract(
              '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
              lendingPoolAbi,
              signer
          )   
        //console.log(Number(await USDC.balanceOf(signer.address)))

        // approve leverager to spend 100k USDC
        await USDC.approve(leverager.address,100000*10**6)

        let priceOracle = new ethers.Contract(
            '0xA50ba011c48153De246E5192C8f9258A2ba79Ca9',
            aavePriceOracleABI,
            signer
        )
        let collateralPrice =  Number(await priceOracle.getAssetPrice(USDC.address)) 
        let debtPrice = Number(await priceOracle.getAssetPrice(WETH.address))
        let collateralizationRatio = 130
        let [leveragedCollateralAmount, leveragedDebtAmount, _collateralAmount, _debtAmount, loops] = getLeveragedPosition(
            100000,
            collateralPrice,
            0,
            debtPrice,
            // collateralization ration is scaled by 10 ** 6
            collateralizationRatio,
            0.0008, // swapMinIn
            10//maxLoops,
        ) 

        console.log(
            leveragedCollateralAmount,
            leveragedDebtAmount,
            loops
        )

        // approve leverager to borrow on behalf of signer
        await vdWETH.approveDelegation(leverager.address, ethers.utils.parseUnits('1000'))
        
        let prevTotalDebtETH = await vdWETH.balanceOf(signer.address)
        let prevCollateralBalance = await aUSDC.balanceOf(signer.address)
        let USDC_WETH_PAIR  = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc'
        let path = await swap.encodeV2Swap(USDC_WETH_PAIR, WETH.address, false)
        let swapData = enco.encode(['uint'], [1]) + path.slice(2,path.length)

        await leverager.connect(signer).wind([
            lendingPool.address,
            priceOracle.address,
            USDC.address,
            WETH.address,
            100000* 10**6,
            0, //Math.round(leveragedCollateralAmount * 10**6), // estimated leveraged collateral amount
            collateralizationRatio / 100 * 10 ** 6,
            6,
            18,
            2,
            loops,
            swapData

        ], {gasPrice: 10*10**9, gasLimit: 7000000})

        let newTotalDebtETH = await vdWETH.balanceOf(signer.address)
        let newCollateralBalance = await aUSDC.balanceOf(signer.address)
        expect(newTotalDebtETH).greaterThan(prevTotalDebtETH, "Failed to leverage")  
        console.log(Number((await lendingPool.getUserAccountData(signer.address)).healthFactor) / 10 ** 18)           
        console.log(Number(newCollateralBalance)/10 ** 6, leveragedCollateralAmount)  
        console.log(Number(newTotalDebtETH)/10**18, leveragedDebtAmount)
  
    })

})