pragma solidity 0.8.9;

import {
    ILendingPool, IUniswapV2Pair, 
    IERC20, SafeERC20, BytesLib, 
    SafeMath ,IUniswapV2Router02
} from './Libraries.sol';
import {Swap} from './Swap.sol';

interface IPriceOracle {    
    function latestAnswer() external view returns (uint);
    function getUnderlyingPrice(ICtoken _pToken) external view returns (uint);
}
interface ICtoken {
    function transfer(address dst, uint amount) external returns (bool);
    function transferFrom(address src, address dst, uint amount) external returns (bool);
    function approve(address spender, uint amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function balanceOfUnderlying(address owner) external returns (uint);
    function getAccountSnapshot(address account) external view returns (uint, uint, uint, uint);
    function borrowRatePerTimestamp() external view returns (uint);
    function supplyRatePerTimestamp() external view returns (uint);
    function totalBorrows() external view returns (uint);
    function totalBorrowsCurrent() external returns (uint);
    function borrowBalancesCurrent(address account) external view returns (uint);
    function borrowBalancesStored(address account) external view returns (uint);
    function exchangeRateCurrent() external  returns (uint);
    function exchangeRateStored() external view returns (uint);
    function getCash() external view returns (uint);
    function accrueInterest() external returns (uint);
    function seize(address liquidator, address borrower, uint seizeTokens) external returns (uint);
    function liquidateBorrow(address borrower, uint amount, address collateral) external returns (uint);
    function liquidateBorrow(address borrower, address collateral) external payable returns (uint);
    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint);
    function repayBorrowBehalf(address borrower) external payable;
    function redeem(uint redeemTokens) external returns (uint);
    function underlying() external view returns(address);
    function totalSupply() external view  returns (uint);
    function totalReserves() external view returns (uint);
}
struct Market {
    // @notice Whether or not this market is listed
    bool isListed;

    // @notice Multiplier representing the most one can borrow against their collateral in this market.
    // For instance, 0.9 to allow borrowing 90% of collateral value. Must be between 0 and 1, and stored as a mantissa.
    uint256 collateralFactorMantissa;

    // @notice Per-market mapping of "accounts in this asset"
    //mapping(address => bool) accountMembership;

    // @notice Whether or not this market receives WPC
    bool isMinted;
}

interface IComptroller {
    function getAccountLiquidity(address account) external view returns (uint, uint, uint);
    function closeFactorMantissa() external view returns(uint);
    function getAllMarkets() external view returns (ICtoken[] memory);
    function accountAssets(address account,uint index) external view returns(ICtoken);
    function markets(address asset) external view returns(Market memory);
    function oracle() external view returns(IPriceOracle);
    function getAssetsIn(address account) external view returns (ICtoken[] memory);
}

interface IWETH {
   function withdraw(uint256 wad) external;
   function deposit() external payable;
}



contract CompoundLiquidator {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using BytesLib for bytes;

    
    address admin;
    address treasury;
    address WETH;
    uint fee = 10000; //initially 1%
    Swap swapper;

    mapping(address=>bool) approvedLendingPools;
    

    constructor(
        address _admin,
        address _treasury,
        address payable _swapper,
        address _WETH,
        address [] memory _approvedLendingPools
    ) {
        admin = _admin;
        treasury = _treasury;
        swapper = Swap(_swapper);
        WETH = _WETH;
        for (uint i=0; i < _approvedLendingPools.length; i++) {
            approvedLendingPools[_approvedLendingPools[i]] = true;
        }
    }

    modifier onlyAdmin(){
        require(msg.sender == admin ,"not admin" );
        _;
    }

    modifier isApprovedLendingPool() {
        require(approvedLendingPools[msg.sender], 'lending pool not approved');
        _;
    }

    event Liquidation(
        address liquidator, 
        address debt, 
        address collateral,
        uint debtAmount,
        uint collateralAmount
    );

    struct aaveLiquidateArgs {
        ILendingPool lendingPool;
        IPriceOracle priceOracle;
        address cTokenDebt;
        address cTokenCollateral;
        address debt;
        address collateral;
        uint debtAmount;
        uint collateralAmount;
        uint collateralCTokenAmount;
        uint collateralCTokenDecimals;
        uint feePlusSlippage;
        uint minSwapOut;
        bytes swapData;
    }

    function liquidate(
        aaveLiquidateArgs memory args 
    ) external { 
        (args.collateralAmount, args.collateralCTokenAmount) = validateLiquidation(
            validateArgs({
                priceOracle: args.priceOracle,
                cTokenDebt: args.cTokenDebt,
                cTokenCollateral: args.cTokenCollateral,
                debtAmount: args.debtAmount,
                collateralAmount: args.collateralAmount,
                collateralCTokenAmount: args.collateralCTokenAmount,
                collateralCTokenDecimals: args.collateralCTokenDecimals,
                feePlusSlippage: args.feePlusSlippage
        }));
    
        uint [] memory modes = new uint[](1);
        address [] memory assets = new address[](1);
        uint [] memory amounts = new uint[](1);

        modes[0] = 0;
        assets[0] = args.debt;
        amounts[0] = args.debtAmount;

        bytes memory data =  abi.encode(
                msg.sender, args.debt, 
                args.collateral, args.cTokenDebt, args.cTokenCollateral, 
                args.debtAmount, args.collateralAmount, args.collateralCTokenAmount
        );
        data = data.concat(args.swapData);

        IERC20 debtToken = IERC20(args.debt);
        IERC20 collateralToken = IERC20(args.collateral);
       
        uint prevDebtBal = debtToken.balanceOf(address(this));
        args.lendingPool.flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this),
            data,
            uint16(0)
        );

        
        uint newDebtBal = debtToken.balanceOf(address(this));
        // we only keep 1% of collateral
        if (args.debt == args.collateral) {
            // if debt == collateral
            // transfer newDebtBal - (prevDebtBal + fee%) to sender
            uint transferAmount = newDebtBal.sub(prevDebtBal.add(prevDebtBal.mul(fee).div(1000000)));
            debtToken.safeTransfer(msg.sender, transferAmount);
        } else {
            // transfer whatever balance of debt left over to the sender
            debtToken.safeTransfer(msg.sender, newDebtBal.sub(prevDebtBal));
        }
        collateralToken.safeTransfer(treasury, collateralToken.balanceOf(address(this)));
        emit Liquidation(msg.sender, args.debt, args.collateral, args.debtAmount, args.collateralAmount);
    }


    struct v2LiquidateArgs {
        IUniswapV2Pair pool;
        bool debtIsToken0;
        address repayToken;

        IPriceOracle priceOracle;
        address cTokenDebt;
        address cTokenCollateral;
        address debt;
        address collateral;
        uint debtAmount;
        uint collateralAmount;
        uint collateralCTokenAmount;
        uint collateralCTokenDecimals;
        uint feePlusSlippage;
        uint minSwapOut;
        bytes swapData;
    }
    function v2Liquidate(
        v2LiquidateArgs memory args
    ) public {
        //require that the value of collateral is at least feePlusSlippage% greater than the debt
        (args.collateralAmount, args.collateralCTokenAmount) = validateLiquidation(
            validateArgs({
                priceOracle: args.priceOracle,
                cTokenDebt: args.cTokenDebt,
                cTokenCollateral: args.cTokenCollateral,
                debtAmount: args.debtAmount,
                collateralAmount: args.collateralAmount,
                collateralCTokenAmount: args.collateralCTokenAmount,
                collateralCTokenDecimals: args.collateralCTokenDecimals,
                feePlusSlippage: args.feePlusSlippage
        }));


        (uint reserve0, uint reserve1, ) = args.pool.getReserves();
        uint repayAmount = getAmountIn(
                args.debtAmount, 
                args.debtIsToken0 ? reserve1 : reserve0,
                args.debtIsToken0 ? reserve0 : reserve1
        );
        
        if (args.debt == args.repayToken)
            repayAmount = getAmountIn(
                repayAmount, 
                args.debtIsToken0 ? reserve0 : reserve1,
                args.debtIsToken0 ? reserve1 : reserve0
            );
        
        bytes memory data =  abi.encode(
                msg.sender, args.debt, 
                args.collateral, args.cTokenDebt, args.cTokenCollateral, args.repayToken,
                args.debtAmount, args.collateralAmount, args.collateralCTokenAmount,
                repayAmount
        );

        data = data.concat(args.swapData);
        IERC20 debtToken = IERC20(args.debt);
        IERC20 collateralToken = IERC20(args.collateral);
        uint prevDebtBal = debtToken.balanceOf(address(this));

        args.pool.swap(
            args.debtIsToken0 ? args.debtAmount : 0,
            args.debtIsToken0 ? 0 : args.debtAmount,
            address(this),
            data
        );

        uint newDebtBal = debtToken.balanceOf(address(this));
        // we only keep 1% of collateral
        if (args.debt == args.collateral) {
            // if debt == collateral
            // transfer newDebtBal - (prevDebtBal + fee%) to sender
            uint transferAmount = newDebtBal.sub(prevDebtBal.add(prevDebtBal.mul(fee).div(1000000)));
            debtToken.safeTransfer(msg.sender, transferAmount);
        } else {
            // transfer whatever balance of debt left over to the sender
            debtToken.safeTransfer(msg.sender, newDebtBal.sub(prevDebtBal));
        }
        collateralToken.safeTransfer(treasury, collateralToken.balanceOf(address(this)));
        emit Liquidation(msg.sender, args.debt, args.collateral, args.debtAmount, args.collateralAmount);


    }

    struct validateArgs {
        IPriceOracle priceOracle;
        address cTokenDebt;
        address cTokenCollateral;
        uint debtAmount;
        uint collateralAmount;
        uint collateralCTokenAmount;
        uint collateralCTokenDecimals;
        uint feePlusSlippage;
    }
    function validateLiquidation(
        validateArgs memory args
    ) public returns(uint, uint){
         ICtoken cTokenCollateral = ICtoken(args.cTokenCollateral);
        
        uint collateralValue = args.priceOracle.getUnderlyingPrice(cTokenCollateral).mul(args.collateralAmount);
        uint debtValue = args.priceOracle.getUnderlyingPrice(ICtoken(args.cTokenDebt)).mul(args.debtAmount);
        require(collateralValue >= (debtValue.add(debtValue.mul(args.feePlusSlippage).div(1000000))), 'Collateral value too low');
        
        //should be exactly 100% + feePlusSlippage
        uint r = args.collateralAmount;
        args.collateralAmount = (debtValue.add(debtValue.mul(args.feePlusSlippage).div(1000000))).mul(args.collateralAmount).div(collateralValue);
        args.collateralCTokenAmount = args.collateralAmount.mul(10**(10+args.collateralCTokenDecimals)).div(cTokenCollateral.exchangeRateCurrent());
       
        // require msg.sender has approved us to spend their collateral
        require(cTokenCollateral.allowance(msg.sender, address(this)) >= args.collateralCTokenAmount, 'No Allowance');
    
        return (args.collateralAmount, args.collateralCTokenAmount);
    }





    function executeOperation(
        address[] memory assets,
        uint256[] memory amounts,
        uint256[] memory premiums,
        address sender,
        bytes memory data
    ) external isApprovedLendingPool returns (bool){
        
        (
            address user, address debt,
            address collateral, address cTokenDebt, address cTokenCollateral,
            uint debtAmount, uint collateralAmount, uint collateralCTokenAmount
        ) = abi.decode(data.slice(0,256), (address, address, address, address, address, uint, uint, uint));

        require(tx.origin == user, 'Liquidation can only be performed by user');

        uint approvalAmount = debtAmount.mul(2).add(premiums[0]);

        IERC20(debt).approve(msg.sender, approvalAmount);
        if (debt == WETH) {
            IWETH(WETH).withdraw(debtAmount);
            ICtoken(cTokenDebt).repayBorrowBehalf{value:debtAmount}(user);
        } else {
            IERC20(debt).approve(cTokenDebt, debtAmount);
            ICtoken(cTokenDebt).repayBorrowBehalf(user, debtAmount);
        }
        
        ICtoken(cTokenCollateral).transferFrom(user, address(this), collateralCTokenAmount);
        ICtoken(cTokenCollateral).redeem(ICtoken(cTokenCollateral).balanceOf(address(this)));

        if (collateral == WETH) {
            IWETH(WETH).deposit{value:address(this).balance}();
        }
     
        if (data.length > 256) {
            data = data.slice(256, data.length-256);
            collateralAmount = collateralAmount.sub(collateralAmount.mul(fee).div(1000000)); // collateral amount minus our 1% fee
            IERC20(collateral).safeTransfer(address(swapper), collateralAmount);
            uint swapAmountOut = approvalAmount;

            try swapper.swap(
                collateralAmount,
                data,
                debt
            ) {

            } catch {
                revert('swap failed');
            }
        }
        
       
        return true;

    }

    fallback(bytes calldata r) external returns (bytes memory){
        (uint amount0, uint amount1) = abi.decode(r.slice(36,96), (uint, uint));
        v2Call(amount0, amount1, r.slice(164, r.length-164));
    }
    
    function v2Call(uint amount0, uint amount1, bytes memory data) internal {
        (
            address user, address debt,
            address collateral, address cTokenDebt, address cTokenCollateral, address repayToken,
            uint debtAmount, uint collateralAmount, uint collateralCTokenAmount, uint repayAmount
        ) = abi.decode(data.slice(0,320), (address, address, address, address, address, address, uint, uint, uint, uint));

        require(tx.origin == user, 'Liquidation can only be performed by user');


        if (debt == WETH) {
            IWETH(WETH).withdraw(debtAmount);
            ICtoken(cTokenDebt).repayBorrowBehalf{value:debtAmount}(user);
        } else {
            IERC20(debt).approve(cTokenDebt, debtAmount);
            ICtoken(cTokenDebt).repayBorrowBehalf(user, debtAmount);
        }
        
        ICtoken(cTokenCollateral).transferFrom(user, address(this), collateralCTokenAmount);
        ICtoken(cTokenCollateral).redeem(ICtoken(cTokenCollateral).balanceOf(address(this)));

        if (collateral == WETH) {
            IWETH(WETH).deposit{value:address(this).balance}();
        }

        if (data.length > 320) {
            data = data.slice(320, data.length-320);
            collateralAmount = collateralAmount.sub(collateralAmount.mul(fee).div(1000000)); // collateral amount minus our 1% fee
            IERC20(collateral).safeTransfer(address(swapper), collateralAmount);
        
            try swapper.swap(
                collateralAmount,
                data,
                repayToken
            ) {

            } catch {
                revert('swap failed');
            }
        }
        
        IERC20(repayToken).safeTransfer(msg.sender, repayAmount);
    }


    function setSwapper(address payable _swapper) external onlyAdmin  {
        swapper = Swap(_swapper);
    }

    function setFee(uint _fee) external onlyAdmin {
        fee = _fee;
    }

    function setTreasury(address _treasury) external onlyAdmin {
        treasury = _treasury;
    }

    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
    }

    function approveLendingPool(address pool) external onlyAdmin {
        approvedLendingPools[pool] = true;
    }

    function disapproveLendingPool(address pool) external onlyAdmin {
        approvedLendingPools[pool] = false;
    }
    
    function getCash(address _token) external onlyAdmin {
        IERC20 token =  IERC20(_token);
        uint bal = token.balanceOf(address(this));
        token.safeTransfer(admin, bal);
    }

    function getCashSend(address _token, address to) external onlyAdmin {
        IERC20 token =  IERC20(_token);
        uint bal = token.balanceOf(address(this));
        token.safeTransfer(to, bal);
    }
    receive() payable external {
      
    }



     function getAmountOutWithReserves(address _pair,  bool isToken0, uint amountIn) internal view returns (uint,uint,uint ){
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

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) pure internal returns (uint amountIn) {
       assembly {
            let numerator := mul(mul(reserveIn,amountOut),0x03e8)
            let denominator := mul(sub(reserveOut,amountOut),0x03e5)
            amountIn := add(div(numerator,denominator),0x01)
        }
    }
    
}

