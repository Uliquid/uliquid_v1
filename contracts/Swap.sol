pragma solidity 0.8.9;

import {
    ILendingPool, IUniswapV2Pair, 
    IERC20, SafeERC20, BytesLib, 
    SafeMath ,IUniswapV2Router02,
    IPriceOracle} from './Libraries.sol';

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

interface IWETH {
   function withdraw(uint256 wad) external;
   function deposit() external payable;
}


interface IAToken {
    function UNDERLYING_ASSET_ADDRESS() view external returns (address);
}
interface ICurveETHPool {
    function exchange(int128 i, int128 j, uint dx, uint min_dy) external payable;
    function exchange(uint256 i, uint256 j, uint dx, uint min_dy) external payable;
}

interface ICurvePool {
    function get_dy(int128 i, int128 j, uint dx) view external  returns (uint);
    function get_dy(uint256 i, uint256 j, uint256 dx) view external  returns (uint);
    function coins(int128 i) view external returns (address);
    function coins(uint256 i) view external returns (address);
    function exchange(int128 i, int128 j, uint dx, uint min_dy) external;
    function exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy) external;
    function exchange_underlying(int128 i, int128 j, uint dx, uint min_dy) external;
    function exchange_underlying(uint256 i, uint256 j, uint256 dx, uint256 min_dy) external;
    function calc_withdraw_one_coin(uint256 tokenAmount, int128 i) view external returns (uint);
    function calc_withdraw_one_coin(uint256 tokenAmount, uint256 i) view external returns (uint);
    function remove_liquidity_one_coin(uint256 tokenAmount, int128 i, uint256 minAmount) external;
    function remove_liquidity_one_coin(uint256 tokenAmount, uint256 i, uint256 minAmount) external;
}

interface I4Pool {
    function calculateSwap(uint8 i, uint8 j, uint dx) view external  returns (uint);
    function swap(
        uint8 tokenIndexFrom,
        uint8 tokenIndexTo,
        uint256 dx,
        uint256 minDy,
        uint256 deadline
    ) external;

    function calculateRemoveLiquidityOneToken(
        uint256 tokenAmount,
        uint8 tokenIndex
    ) external view returns(uint);
    
    function removeLiquidityOneToken(
        uint256 tokenAmount,
        uint8 tokenIndex,
        uint256 minAmount,
        uint256 deadline
    ) external;
}

contract Swap {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using BytesLib for bytes;

    address WETH;
    

    constructor(address _WETH) public {
        WETH = _WETH;
    }

    function swap(
        uint amountIn,
        bytes memory data,
        address _tokenOut
    ) public returns (uint){
        (uint length) = abi.decode(data.slice(0,32), (uint));
        uint start = 32;
        uint dataLength;
        bytes memory path;
        
        for (uint i = 0; i < length; i++) {
            (dataLength) = abi.decode(data.slice(start, 32), (uint));
            path = data.slice(start+32, dataLength-32);
            (bool success, bytes memory d) = address(this).call(path.concat(abi.encode(amountIn)));
            require(success, "swap failed");
            (amountIn) = abi.decode(d, (uint));
            start += 32 + dataLength;
             
        }
        IERC20 tokenOut = IERC20(_tokenOut);
        tokenOut.safeTransfer(msg.sender, tokenOut.balanceOf(address(this)));
        return amountIn;
    }

    function getLength(bytes memory data) public pure returns (uint){
        return data.length;
    }

    function encodeCurveSwapETH2(
        address pool,
        address tokenIn,
        uint256 i,
        uint256 j
    ) pure public returns (bytes memory data) {
        bytes memory r = abi.encodeWithSignature("curveSwapETH2(bytes)", abi.encode(pool, tokenIn, i, j, 0));
        data = abi.encode(r.length).concat(r);
    }

    function curveSwapETH2(
        bytes memory data
    ) public returns (uint) {
        (address pool, address tokenIn, uint256 i, uint256 j, uint amountIn) = abi.decode(data, (address, address, uint256, uint256, uint));
        uint amountOut = ICurvePool(pool).get_dy(i,j, amountIn);
    
        IERC20(tokenIn).approve(pool, amountIn);

        ICurveETHPool(pool).exchange(
            i, j, amountIn, 0  
        );
        
        return amountOut - 10;
    }

    function encodeCurveSwapETH(
        address pool,
        address tokenIn,
        int128 i,
        int128 j
    ) pure public returns (bytes memory data) {
        bytes memory r = abi.encodeWithSignature("curveSwapETH(bytes)", abi.encode(pool, tokenIn, i, j, 0));
        data = abi.encode(r.length).concat(r);
    }

    function curveSwapETH(
        bytes memory data
    ) public returns (uint) {
        (address pool, address tokenIn, int128 i, int128 j, uint amountIn) = abi.decode(data, (address, address, int128, int128, uint));
        uint amountOut = ICurvePool(pool).get_dy(i,j, amountIn);

        IERC20(tokenIn).approve(pool, amountIn);

        ICurveETHPool(pool).exchange(
            i, j, amountIn, 0  
        );
            
        return amountOut - 10;
    }

    function encode4PoolRedeem(
        address pool,
        address tokenIn,
        uint8 i
    ) pure public returns (bytes memory data) {
        bytes memory r = abi.encodeWithSignature("r4PoolRedeem(bytes)", abi.encode(pool, tokenIn, i, 0));
        data = abi.encode(r.length).concat(r);
    }

    function r4PoolRedeem(
        bytes memory data
    ) public returns (uint)  {
        (address pool, address tokenIn, uint8 i, uint amountIn) = abi.decode(data, (address, address, uint8, uint));
        uint amountOut = I4Pool(pool).calculateRemoveLiquidityOneToken(amountIn, i);
        IERC20(tokenIn).approve(pool, amountIn);
        I4Pool(pool).removeLiquidityOneToken(
            amountIn,
            i,
            amountOut,
            block.timestamp
        );

        return amountOut - 10;
    }
    

    function encode4PoolSwap(
        address pool,
        address tokenIn,
        uint8 i,
        uint8 j
    ) pure public returns (bytes memory data) {
        bytes memory r = abi.encodeWithSignature("r4PoolSwap(bytes)", abi.encode(pool, tokenIn, i, j, 0));
        data = abi.encode(r.length).concat(r);
    }

    function r4PoolSwap(
        bytes memory data
    ) public returns (uint)  {

        (address pool, address tokenIn, uint8 i, uint8 j, uint amountIn) = abi.decode(data, (address, address, uint8, uint8, uint));
        uint amountOut = I4Pool(pool).calculateSwap(i,j, amountIn);
        IERC20(tokenIn).approve(pool, amountIn);

        I4Pool(pool).swap(
            i,j, amountIn, 0, block.timestamp
        );
        return amountOut - 10;
    }
    
    
    function encodeATokens(
        address pool,
        address tokenIn,
        uint code
       
    ) pure public returns (bytes memory data) {
        bytes memory r = abi.encodeWithSignature("aTokens(bytes)", abi.encode(pool,tokenIn, code, 0));
        data = abi.encode(r.length).concat(r);
    }
    
    function aTokens(
        bytes memory data
    ) public returns (uint)  {
        
        (address lending_pool, address token,  uint code, uint amountIn) = abi.decode(data, (address, address,  uint, uint));
        if (code == 0) {
            IERC20(token).approve(lending_pool, amountIn);
            //deposit
            ILendingPool(lending_pool).deposit(
                token,
                amountIn,
                address(this),
                0
            );
        } else if (code == 1) {
            //withdraw
            IERC20(token).approve(lending_pool, amountIn);

            ILendingPool(lending_pool).withdraw(
                IAToken(token).UNDERLYING_ASSET_ADDRESS(),
                amountIn,
                address(this)
            );
        }
        return amountIn;
    }


    function encodeCurve3PoolRedeem2(
        address pool,
        address tokenIn,
        uint256 i
    ) pure public returns (bytes memory data) {
        bytes memory r = abi.encodeWithSignature("curve3poolRedeem2(bytes)", abi.encode(pool, tokenIn,  i, 0));
        data = abi.encode(r.length).concat(r);
    }

    function curve3poolRedeem2(
        bytes memory data
    ) public returns (uint)  {
        (address pool, address tokenIn,  uint256 i, uint amountIn) = abi.decode(data, (address, address, uint256, uint));
        IERC20(tokenIn).approve(pool, amountIn);
        uint amountOut = ICurvePool(pool).calc_withdraw_one_coin(amountIn, i);
        ICurvePool(pool).remove_liquidity_one_coin(
            amountIn,
            i,
            amountOut
        );

        return amountOut - 10;
    }

    function encodeCurveSwap2(
        address pool,
        address tokenIn,
        uint256 i,
        uint256 j
    ) pure public returns (bytes memory data) {
        bytes memory r = abi.encodeWithSignature("curveSwap2(bytes)", abi.encode(pool, tokenIn, i, j, 0));
        data = abi.encode(r.length).concat(r);
    }

    function curveSwap2(
        bytes memory data
    ) public returns (uint) {
        (address pool, address tokenIn, uint256 i, uint256 j, uint amountIn) = abi.decode(data, (address, address, uint256, uint256, uint));
        IERC20(tokenIn).approve(pool, amountIn);
        uint amountOut = ICurvePool(pool).get_dy(i,j, amountIn);
        ICurvePool(pool).exchange(
        i, j, amountIn, 0  
        );
        return amountOut - 10;
    }

    function encodeCurve3PoolRedeem(
        address pool,
        address tokenIn,
        int128 i
    ) pure public returns (bytes memory data) {
        bytes memory r = abi.encodeWithSignature("curve3poolRedeem(bytes)", abi.encode(pool, tokenIn,  i, 0));
        data = abi.encode(r.length).concat(r);
    }

    function curve3poolRedeem(
        bytes memory data
    ) public returns (uint)  {
        (address pool, address tokenIn,  int128 i, uint amountIn) = abi.decode(data, (address, address, int128, uint));
        IERC20(tokenIn).approve(pool, amountIn);

        uint amountOut = ICurvePool(pool).calc_withdraw_one_coin(amountIn, i);
        ICurvePool(pool).remove_liquidity_one_coin(
            amountIn,
            i,
            amountOut
        );
        return amountOut - 10;
    }
    

    function encodeCurveSwap(
        address pool,
        address tokenIn,
        int128 i,
        int128 j
    ) pure public returns (bytes memory data) {
        bytes memory r = abi.encodeWithSignature("curveSwap(bytes)", abi.encode(pool, tokenIn, i, j, 0));
        data = abi.encode(r.length).concat(r);
    }

    function curveSwap(
        bytes memory data
    ) public returns (uint) {
        (address pool, address tokenIn, int128 i, int128 j, uint amountIn) = abi.decode(data, (address, address, int128, int128, uint));
        IERC20(tokenIn).approve(pool, amountIn);
        uint amountOut = ICurvePool(pool).get_dy(i,j, amountIn);
        ICurvePool(pool).exchange(
           i, j, amountIn, 0  
        );
        return amountOut - 10;
    }

    function encodeV2Swap(
        address pool,
        address tokenIn,
        bool isToken0
    ) pure public returns (bytes memory data) {

        bytes memory r = abi.encodeWithSignature("v2swap(bytes)", abi.encode(pool, tokenIn, isToken0, 0));
        data = abi.encode(r.length).concat(r);
    }   

    function v2swap(
        bytes memory data
    ) public returns (uint){
        (address pool, address tokenIn, bool isToken0, uint amountIn) = abi.decode(data, (address, address, bool, uint));
        uint amountOut = getV2AmountOut(
                pool,
                isToken0,
                amountIn
        );
       
        IERC20(tokenIn).safeTransfer(pool, amountIn);

        IUniswapV2Pair(pool).swap(
            isToken0? 0 : amountOut,
            isToken0? amountOut : 0,
            address(this),
            ''
        );
        return amountOut;
    }

    function encodeV3Swap(
        address router,
        address tokenIn,
        address tokenOut,
        uint24 fee
    ) pure public returns (bytes memory data) {

        bytes memory r = abi.encodeWithSignature("v3Swap(bytes)", abi.encode(router, tokenIn, tokenOut, fee, 0));
        data = abi.encode(r.length).concat(r);
    }   

    function v3Swap(
        bytes memory data
    ) public returns (uint){ 
        (address router, address tokenIn, address tokenOut,  uint24 fee, uint amountIn) = abi.decode(data, (address, address, address, uint24, uint));
        IERC20(tokenIn).approve(router, amountIn);
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
        });
        return ISwapRouter(router).exactInputSingle(params);
    }


    function getV2AmountOut(address _pair,  bool isToken0, uint amountIn) public view returns (uint amountOut){
        (uint112 _reserve0, uint112 _reserve1, uint32 __) =  IUniswapV2Pair(_pair).getReserves();
        uint reserveIn = isToken0?_reserve0: _reserve1;
        uint reserveOut = isToken0? _reserve1: _reserve0;
        assembly{
            let amountInWithFee := mul(amountIn,0x03e5)
            let numerator := mul(amountInWithFee,reserveOut)
            let denominator :=  add(mul(reserveIn,0x03e8),amountInWithFee)
            amountOut :=  div(numerator,denominator)
        }
    }

    function getV2AmountOutWithReserves(address _pair,  bool isToken0, uint amountIn) public view returns (uint,uint,uint ){
        (uint112 _reserve0, uint112 _reserve1, uint32 __) =  IUniswapV2Pair(_pair).getReserves();
        uint reserveIn = isToken0?_reserve0: _reserve1;
        uint reserveOut = isToken0? _reserve1: _reserve0;
        uint amountOut;
        assembly{
            let amountInWithFee := mul(amountIn,0x03e5)
            let numerator := mul(amountInWithFee,reserveOut)
            let denominator :=  add(mul(reserveIn,0x03e8),amountInWithFee)
            amountOut :=  div(numerator,denominator)
        }
        return (amountOut, reserveIn, reserveOut);
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) pure public returns (uint amountIn) {
       assembly {
            let numerator := mul(mul(reserveIn,amountOut),0x03e8)
            let denominator := mul(sub(reserveOut,amountOut),0x03e5)
            amountIn := add(div(numerator,denominator),0x01)
        }
    }
    
    receive() external payable {
        IWETH(WETH).deposit{value:msg.value}();
    }
}