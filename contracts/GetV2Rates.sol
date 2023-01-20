pragma solidity 0.8.9;


import {IERC20, IUniswapV2Pair} from "./Libraries.sol";


contract V2Rates {

    struct Pair {
        address     pair;
        address     token0;
        address     token1;
        uint16       decimals0;
        uint16       decimals1;
        string      symbol0;
        string      symbol1;
        uint112[2]   reserves;
    }
    function getRates (
       address[] memory _pairs, bool returnTokenDetails
    ) public view returns (Pair[] memory){
        
        Pair[] memory pairs = new Pair[](_pairs.length);
        for (uint i=0; i<_pairs.length; i++) {
            Pair memory _Pair;
            _Pair.pair = _pairs[i];
            IUniswapV2Pair _pairContract = IUniswapV2Pair(_pairs[i]);
            if (returnTokenDetails) {
                IERC20 token0 =  IERC20(_pairContract.token0());
                IERC20 token1 =  IERC20(_pairContract.token1());           
                string memory symbol0 = token0.symbol();
                string memory symbol1 = token1.symbol();
                uint16 decimals0 = token0.decimals();
                uint16 decimals1 = token1.decimals();
                _Pair.token0 = address(token0);
                _Pair.token1 = address(token1);
                _Pair.symbol0  = symbol0;
                _Pair.symbol1 = symbol1;
                _Pair.decimals0 = decimals0;
                _Pair.decimals1 = decimals1;
            }
           
            (uint112 r1, uint112 r2, uint32 timestamp) = _pairContract.getReserves();
            uint112 [2] memory reserves = [uint112(r1),uint112(r2)];
            _Pair.reserves = reserves;
            pairs[i] = _Pair;
        }
        return pairs;
    }
}