const {
    time,
    loadFixture,
  } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const hre = require("hardhat");
const enco = new ethers.utils.AbiCoder();

const erc20Abi = require('../../abi/erc20.json');
const {deploySwap} = require('../swap/deploySwap')



// PASSED TESTS ON BLOCK 15812600
describe("Swap",  function() {
  
    

    describe("Uniswap V3", async function () {
      it(`Should encode swap data and swap one token for another through a Uniswap V2 Pair`, async function () {
        let swap =   await loadFixture(deploySwap)
        // get signer with USDC tokens
        let signer = await hre.ethers.getImpersonatedSigner('0x55FE002aefF02F77364de339a1292923A15844B8')   
       
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
        
        let prevWETHBAL = Number(await WETH.balanceOf(signer.address))


        let USDC_WETH_PAIR  = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc'

        //function encodeV2Swap(address pool,address tokenIn,bool isToken0)
        let path = await swap.encodeV2Swap(USDC_WETH_PAIR, USDC.address, true)
        
        let swapData = enco.encode(['uint'], [1]) + path.slice(2,path.length)

        // transfer 1 USDC to swap contract
        await USDC.transfer(swap.address, 100 * 10 ** 6)
        // swap
        await swap.connect(signer).swap(
          100 * 10 ** 6,
          swapData,
          WETH.address
        )
  
        let newWETHBalance = Number(await WETH.balanceOf(signer.address))
        
        expect(newWETHBalance).greaterThan(prevWETHBAL)

    })
  })
   
})