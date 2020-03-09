pragma solidity ^0.5.0;

import "ERC1155Adapter-flat.sol";

contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previous_owner, address indexed new_owner);
    /**
     * @dev The Ownable constructor sets the original `owner` of the contract to the sender
     * account.
     */
    constructor() public {
        owner = msg.sender;
    }
    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }
    /**
    * @dev Allows the current owner to transfer control of the contract to a newOwner.
    * @param new_owner The address to transfer ownership to.
    */
    function transferOwnership(address new_owner) public onlyOwner {
        require(new_owner != address(0));
        emit OwnershipTransferred(owner, new_owner);
        owner = new_owner;
    }
}

contract Admin is Ownable {
    mapping(address => bool) public isAdmin;

    function addAdmin(address who) external onlyOwner {
        isAdmin[who] = true;
    }

    function removeAdmin(address who) external onlyOwner {
        isAdmin[who] = false;
    }

    modifier onlyAdmin() {
        require(msg.sender == owner || isAdmin[msg.sender]);
        _;
    }
}

contract ERC20 {
    function balanceOf(address) external view returns(uint256);
    function transfer(address to, uint256 amount) external returns(bool);
    function transferFrom(address from, address to, uint256 amount) external returns(bool);
    function approve(address from, address to, uint256 amount) external returns(bool);
}

interface ERC20NonStandard {
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 amount) external;
    function transferFrom(address from, address to, uint256 amount) external;
    function approve(address from, address to, uint256 amount) external;
}

interface IDispatcher {

    // external function
    function trigger() external returns (bool);
    function withdrawProfit() external returns (bool);
    function drainFunds(uint256 _index) external returns (bool);
    function refundDispather(address _receiver) external returns (bool);
    function withdrawPrinciple (uint256 _amount) external returns (bool); //custom function

    // get function
    function getReserve() external view returns (uint256);
    function getReserveRatio() external view returns (uint256);
    function getPrinciple() external view returns (uint256);
    function getBalance() external view returns (uint256);
    function getProfit() external view returns (uint256);
    function getTHPrinciple(uint256 _index) external view returns (uint256);
    function getTHBalance(uint256 _index) external view returns (uint256);
    function getTHProfit(uint256 _index) external view returns (uint256);
    function getToken() external view returns (address);
    function getFund() external view returns (address);
    function getTHStructures() external view returns (uint256[] memory, address[] memory, address[] memory);
    function getTHData(uint256 _index) external view returns (uint256, uint256, uint256, uint256);
    function getTHCount() external view returns (uint256);
    function getTHAddress(uint256 _index) external view returns (address);
    function getTargetAddress(uint256 _index) external view returns (address);
    function getPropotion() external view returns (uint256[] memory);
    function getProfitBeneficiary() external view returns (address);
    function getReserveUpperLimit() external view returns (uint256);
    function getReserveLowerLimit() external view returns (uint256);
    function getExecuteUnit() external view returns (uint256);

    // Governmence Functions
    function setAimedPropotion(uint256[] calldata _thPropotion) external returns (bool);
    function addTargetHandler(address _targetHandlerAddr, uint256[] calldata _thPropotion) external returns (bool);
    function removeTargetHandler(address _targetHandlerAddr, uint256 _index, uint256[] calldata _thPropotion) external returns (bool);
    function setProfitBeneficiary(address _profitBeneficiary) external returns (bool);
    function setReserveLowerLimit(uint256 _number) external returns (bool);
    function setReserveUpperLimit(uint256 _number) external returns (bool);
    function setExecuteUnit(uint256 _number) external returns (bool);
    function newOwner() external view returns(address);
    function acceptOwnership() external;
}

contract SimpleSwap is ERC1155withAdapter, Admin {
    event TokenPurchase(address indexed buyer, address indexed token, uint256 coin_sold, uint256 tokens_bought);
    event CoinPurchase(address indexed buyer, address indexed token, uint256 tokens_sold, uint256 coin_bought);
    event AddLiquidity(address indexed provider, address indexed token, uint256 coin_amount, uint256 token_amount);
    event RemoveLiquidity(address indexed provider, address indexed token, uint256 coin_amount, uint256 token_amount);

    mapping(address => address) public DispatcherOf;
    mapping(address => uint256) public coinReserveShare;

    uint256 public totalCoinStored;
    uint256 public globalIndex = 1e18;
    uint256 public feeRate = 3000000000000000;
    address public coin = address(0xdBCFff49D5F48DDf6e6df1f2C9B96E1FC0F31371);



    function updateGlobalIndex() public {
        if(totalCoinStored > 0) {
            globalIndex = globalIndex.mul(tokenReserveOf(coin)).div(totalCoinStored);
            totalCoinStored = tokenReserveOf(coin);
        }
    }

    function coinReserveOf(address token) public view returns(uint256) {
        return coinReserveShare[token].mul(globalIndex) / 1e18;
    }

    function tokenReserveOf(address token) public view returns(uint256) {
        uint256 amount = ERC20(token).balanceOf(address(this));
        if(DispatcherOf[token] != address(0)) {
            amount = amount.add(IDispatcher(DispatcherOf[token]).getBalance());
        }
    }

    function depositAndTrigger(address token, address from, uint256 amount) internal {
        require(doTransferIn(token, from, amount));
        address dispatcher = DispatcherOf[token];
        if(dispatcher != address(0)){
            IDispatcher(dispatcher).trigger();
        }
    }

    function checkAndWithdraw(address token, address to, uint256 amount) internal {
        uint256 cash = ERC20(token).balanceOf(address(this));
        if(cash < amount) 
            IDispatcher(DispatcherOf[token]).withdrawPrinciple(amount.sub(cash));
        require(doTransferOut(token, to, amount));
    }

    /***********************************|
    |        Manager Functions          |
    |__________________________________*/

    function setDispatcher(address token, address dispatcher) external onlyAdmin {
        // maybe check previous dispatcher balance if exist?
        DispatcherOf[token] = dispatcher;
        require(IDispatcher(dispatcher).newOwner() == address(this));
        IDispatcher(dispatcher).acceptOwnership();
        doApproval(token, dispatcher, uint256(-1));
    }

    function setFee(uint256 new_fee) external onlyAdmin {
        require(new_fee <= 30000000000000000); //fee must be smaller than 3%
        feeRate = new_fee;
    }

    function createAdapter(uint256 _id, string memory _name, string memory _symbol, uint8 _decimals) public onlyAdmin {
        require(adapter[_id] == address(0));
        address a = createClone(template);
        ERC20Adapter(a).setup(_id, _name, _symbol, _decimals);
        adapter[_id] = a;
        emit NewAdapter(_id, a);
    }

    /***********************************|
    |        Exchange Functions         |
    |__________________________________*/

    /**
     * @dev Pricing function for converting between tokens.
     * @param input_amount Amount of Tokens being sold.
     * @param input_reserve Amount of Tokens in exchange reserves.
     * @param output_reserve Amount of Tokens in exchange reserves.
     * @return Amount of Tokens bought.
     */
    function getInputPrice(uint256 input_amount, uint256 input_reserve, uint256 output_reserve) public view returns (uint256) {
        require(input_reserve > 0 && output_reserve > 0);
        uint256 input_amount_with_fee = input_amount.mul(1e18 - feeRate);
        uint256 numerator = input_amount_with_fee.mul(output_reserve);
        uint256 denominator = input_reserve.mul(1e18).add(input_amount_with_fee);
        return numerator / denominator;
    }

    /**
     * @dev Pricing function for converting between Tokens.
     * @param output_amount Amount of Tokens being bought.
     * @param input_reserve Amount of Tokens in exchange reserves.
     * @param output_reserve Amount of Tokens in exchange reserves.
     * @return Amount of Tokens sold.
     */
    function getOutputPrice(uint256 output_amount, uint256 input_reserve, uint256 output_reserve) public view returns (uint256) {
        require(input_reserve > 0 && output_reserve > 0);
        uint256 numerator = input_reserve.mul(output_amount).mul(1e18);
        uint256 denominator = (output_reserve.sub(output_amount)).mul(1e18 - feeRate);
        return (numerator / denominator).add(1);
    }

    function CoinToTokenInput(address token, uint256 Coin_sold, uint256 min_tokens, uint256 deadline, address buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && Coin_sold > 0 && min_tokens > 0);
        updateGlobalIndex();
        uint256 tokens_bought = getInputPrice(Coin_sold, coinReserveOf(token), tokenReserveOf(token));
        coinReserveShare[token] = coinReserveShare[token].add(Coin_sold.mul(1e18)/globalIndex);

        checkAndWithdraw(token, recipient, tokens_bought);

        require(tokens_bought >= min_tokens);
        require(doTransferIn(coin, buyer, Coin_sold));
        
        emit TokenPurchase(buyer, token, Coin_sold, tokens_bought);
        return tokens_bought;
    }

    /**
     * @notice Convert coin to tokens.
     * @dev User specifies exact coin input && minium output.
     * @param token Address of Tokens bought.
     * @param Coin_sold Amount of coin user wants to pay.
     * @param min_tokens Minium Tokens bought.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of Tokens bought.
     */
    function CoinToTokenSwapInput(address token, uint256 Coin_sold, uint256 min_tokens, uint256 deadline) public returns (uint256) {
        return CoinToTokenInput(token, Coin_sold, min_tokens, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert coin to Tokens && transfers Tokens to recipient.
     * @dev User specifies exact coin input && minium output.
     * @param token Address of Tokens bought.
     * @param Coin_sold Amount of coin user wants to pay.
     * @param min_tokens Minium Tokens bought.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient The addresss that recieves output Tokens.
     * @return Amount of Token bought.
     */
    function CoinToTokenTransferInput(address token, uint256 Coin_sold, uint256 min_tokens, uint256 deadline, address recipient) public returns(uint256) {
        require(recipient != address(this) && recipient != address(0));
        return CoinToTokenInput(token, Coin_sold, min_tokens, deadline, msg.sender, recipient);
    }

    function CoinToTokenOutput(address token, uint256 tokens_bought, uint256 max_Coin, uint256 deadline, address  buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && tokens_bought > 0 && max_Coin > 0);
        updateGlobalIndex();
        uint256 Coin_sold = getOutputPrice(tokens_bought, coinReserveOf(token), tokenReserveOf(token));
        coinReserveShare[token] = coinReserveShare[token].add(Coin_sold.mul(1e18)/globalIndex);

        checkAndWithdraw(token, recipient, tokens_bought);

        require(Coin_sold <= max_Coin);
        require(doTransferIn(coin, buyer, Coin_sold));

        emit TokenPurchase(buyer, token, Coin_sold, tokens_bought);
        return Coin_sold;
    }

    /**
     * @notice Convert coin to Tokens.
     * @dev User specifies maxium coin input && exact output.
     * @param token Address of Tokens bought.
     * @param tokens_bought Amount of token bought.
     * @param max_Coin Maxium amount of coin sold.
     * @param deadline Time after which this transaction can be no longer be executed.
     * @return Amount of coin sold.
     */
    function CoinToTokenSwapOutput(address token, uint256 tokens_bought, uint256 max_Coin, uint256 deadline) public returns(uint256) {
        return CoinToTokenOutput(token, tokens_bought, max_Coin, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert coin to Tokens && transfer Tokens to recipient.
     * @dev User specifies maxium coin input && exact output.
     * @param token Address of Tokens bought.
     * @param tokens_bought Amount of token bought.
     * @param max_Coin Maxium amount of coin sold.
     * @param deadline Time after which this transaction can be no longer be executed.
     * @param recipient The address the receives output Tokens.
     * @return Amount of coin sold.
     */
    function CoinToTokenTransferOutput(address token, uint256 tokens_bought, uint256 max_Coin, uint256 deadline, address recipient) public returns (uint256) {
        require(recipient != address(this) && recipient != address(0));
        return CoinToTokenOutput(token, tokens_bought, max_Coin, deadline, msg.sender, recipient);
    }

    function tokenToCoinInput(address token, uint256 tokens_sold, uint256 min_Coin, uint256 deadline, address buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && tokens_sold > 0 && min_Coin > 0);
        updateGlobalIndex();
        uint256 Coin_bought = getInputPrice(tokens_sold, tokenReserveOf(token), coinReserveOf(token));
        coinReserveShare[token] = coinReserveShare[token].sub(Coin_bought.mul(1e18)/globalIndex);

        require(Coin_bought >= min_Coin);
        depositAndTrigger(token, buyer, tokens_sold);
        require(doTransferOut(coin, recipient, Coin_bought));

        emit CoinPurchase(buyer, token, tokens_sold, Coin_bought);
        return Coin_bought;
    }

    /**
     * @notice Convert Tokens to coin.
     * @dev User specifies exact input && minium output.
     * @param token Address of Tokens sold.
     * @param tokens_sold Amount of Tokens sold.
     * @param min_Coin Minium coin purchased.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of coin bought.
     */
    function tokenToCoinSwapInput(address token, uint256 tokens_sold, uint256 min_Coin, uint256 deadline) public returns (uint256) {
        return tokenToCoinInput(token, tokens_sold, min_Coin, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert Tokens to coin && transfer coin to recipient.
     * @dev User specifies exact input && minium output.
     * @param token The address of Tokens sold.
     * @param tokens_sold Amount of Tokens sold.
     * @param min_Coin Minium coin purchased.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient The address that receives output coin.
     * @return Amount of coin bought.
     */
    function tokenToCoinTransferInput(address token, uint256 tokens_sold, uint256 min_Coin, uint256 deadline, address recipient) public returns (uint256) {
        require(recipient != address(this) && recipient != address(0));
        return tokenToCoinInput(token, tokens_sold, min_Coin, deadline, msg.sender, recipient);
    }

    function tokenToCoinOutput(address token, uint256 Coin_bought, uint256 max_tokens, uint256 deadline, address buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && Coin_bought > 0);
        updateGlobalIndex();
        uint256 tokens_sold = getOutputPrice(Coin_bought, tokenReserveOf(token), coinReserveOf(token));
        coinReserveShare[token] = coinReserveShare[token].sub(Coin_bought.mul(1e18)/globalIndex);

        require(max_tokens >= tokens_sold);
        depositAndTrigger(token, buyer, tokens_sold);
        require(doTransferOut(coin, recipient, Coin_bought));

        emit CoinPurchase(buyer, token, tokens_sold, Coin_bought);
        return tokens_sold;
    }

    /**
     * @notice Convert Tokens to coin.
     * @dev User specifies maxium input && exact output.
     * @param token Address of Tokens sold.
     * @param Coin_bought Amount of coin bought.
     * @param max_tokens Maxium Tokens sold.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of Tokens sold.
     */
    function tokenToCoinSwapOutput(address token, uint256 Coin_bought, uint256 max_tokens, uint256 deadline) public returns (uint256) {
        return tokenToCoinOutput(token, Coin_bought, max_tokens, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert Tokens to coin && transfers coin to recipient.
     * @dev User specifies maxium input && exact output.
     * @param token Address of Tokens sold.
     * @param Coin_bought Amount of coin bought.
     * @param max_tokens Maxium Tokens sold.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient The address that receives output coin.
     * @return Amount of Tokens sold.
     */
    function tokenToCoinTransferOutput(address token, uint256 Coin_bought, uint256 max_tokens, uint256 deadline, address  recipient) public returns (uint256) {
        require(recipient != address(this) && recipient != address(0));
        return tokenToCoinOutput(token, Coin_bought, max_tokens, deadline, msg.sender, recipient);
    }

    function tokenToTokenInput(
        address input_token,
        address output_token,
        uint256 tokens_sold,
        uint256 min_tokens_bought,
        uint256 deadline,
        address buyer,
        address recipient)
        private returns (uint256)
    {
        //check not self-swapping
        require(input_token != output_token);
        //check if such trading pair exists
        require(totalSupply[uint256(input_token)] > 0 && totalSupply[uint256(output_token)] > 0);
        require(deadline >= block.timestamp && tokens_sold > 0 && min_tokens_bought > 0);
        updateGlobalIndex();
        uint256 Coin_bought = getInputPrice(tokens_sold, tokenReserveOf(input_token), coinReserveOf(input_token));
        uint256 token_bought = getInputPrice(Coin_bought, coinReserveOf(output_token), tokenReserveOf(output_token));

        // move coin reserve
        coinReserveShare[input_token] = coinReserveShare[input_token].sub(Coin_bought.mul(1e18)/globalIndex);
        coinReserveShare[output_token] = coinReserveShare[output_token].add(Coin_bought.mul(1e18)/globalIndex);


        checkAndWithdraw(output_token, recipient, token_bought);
        //tokenReserveOf(input_token) = tokenReserveOf(input_token).add(tokens_sold);

        // do input/output token transfer
        require(min_tokens_bought <= token_bought);
        depositAndTrigger(input_token, buyer, tokens_sold);

        emit CoinPurchase(buyer, input_token, tokens_sold, Coin_bought);
        emit TokenPurchase(buyer, output_token, Coin_bought, token_bought);
        return token_bought;
    }

    /**
     * @notice Convert Tokens to Tokens.
     * @dev User specifies exact input && minium output.
     * @param input_token Address of Tokens sold.
     * @param output_token Address of Tokens bought.
     * @param tokens_sold Amount of Tokens sold.
     * @param min_tokens_bought Minium amount of Tokens bought.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of Tokens bought.
     */
    function tokenToTokenSwapInput(
        address input_token,
        address output_token,
        uint256 tokens_sold,
        uint256 min_tokens_bought,
        uint256 deadline)
        public returns (uint256)
    {
        return tokenToTokenInput(input_token, output_token, tokens_sold,  min_tokens_bought, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert Tokens to Tokens && transfers Tokens to recipient.
     * @dev User specifies exact input && minium output.
     * @param input_token Address of Tokens sold.
     * @param output_token Address of Tokens bought.
     * @param tokens_sold Amount of Tokens sold.
     * @param min_tokens_bought Minium amount of Tokens bought.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient The address that recieves output token.
     * @return Amount of Tokens bought.
     */
    function tokenToTokenTransferInput(
        address input_token,
        address output_token,
        uint256 tokens_sold,
        uint256 min_tokens_bought,
        uint256 deadline,
        address recipient)
        public returns (uint256)
    {
        return tokenToTokenInput(input_token, output_token, tokens_sold,  min_tokens_bought, deadline, msg.sender, recipient);
    }

    function tokenToTokenOutput(
        address input_token,
        address output_token,
        uint256 tokens_bought,
        uint256 max_tokens_sold,
        uint256 deadline,
        address buyer,
        address recipient)
        private returns (uint256)
    {
        //check not self-swapping
        require(input_token != output_token);
        //check if such trading pair exists
        require(totalSupply[uint256(input_token)] > 0 && totalSupply[uint256(output_token)] > 0);
        require(deadline >= block.timestamp && tokens_bought > 0);
        updateGlobalIndex();
        uint256 Coin_bought = getOutputPrice(tokens_bought, coinReserveOf(output_token), tokenReserveOf(output_token));

        uint256 tokens_sold;
        tokens_sold = tokenToTokenOutputHelper(input_token,Coin_bought);

        // move coin reserve
        coinReserveShare[input_token] = coinReserveShare[input_token].sub(Coin_bought.mul(1e18)/globalIndex);
        coinReserveShare[output_token] = coinReserveShare[output_token].add(Coin_bought.mul(1e18)/globalIndex);

        checkAndWithdraw(output_token, recipient, tokens_bought);

        //tokenReserveOf(input_token) = tokenReserveOf(input_token).add(tokens_sold);

        require(max_tokens_sold >= tokens_sold);
        depositAndTrigger(input_token, buyer, tokens_sold);

        emit CoinPurchase(buyer, input_token, tokens_sold, Coin_bought);
        emit TokenPurchase(buyer, output_token, Coin_bought, tokens_bought);
        return tokens_sold;
    }

    function tokenToTokenOutputHelper(address input_token, uint256 Coin_bought) private view returns(uint256) {
        uint256 tokens_sold = getOutputPrice(Coin_bought, tokenReserveOf(input_token), coinReserveOf(input_token));
        return  tokens_sold;
    }

    /**
     * @notice Convert Tokens to Tokens.
     * @dev User specifies maxium input && exact output.
     * @param input_token Address of Tokens sold.
     * @param output_token Address of Tokens bought.
     * @param tokens_bought Amount of Tokens bought.
     * @param max_tokens_sold Maxium amount of Tokens sold.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of Tokens sold.
     */
    function tokenToTokenSwapOutput(
        address input_token,
        address output_token,
        uint256 tokens_bought,
        uint256 max_tokens_sold,
        uint256 deadline)
        public returns (uint256)
    {
        return tokenToTokenOutput(input_token, output_token, tokens_bought, max_tokens_sold, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert Tokens to Tokens && transfers Tokens to recipient.
     * @dev User specifies maxium input && exact output.
     * @param input_token Address of Tokens sold.
     * @param output_token Address of Tokens bought.
     * @param tokens_bought Amount of Tokens bought.
     * @param max_tokens_sold Maxium amount of Tokens sold.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient The address that receives output Tokens.
     * @return Amount of Tokens sold.
     */
    function tokenToTokenTransferOutput(
        address input_token,
        address output_token,
        uint256 tokens_bought,
        uint256 max_tokens_sold,
        uint256 deadline,
        address recipient)
        public returns (uint256)
    {

        return tokenToTokenOutput(input_token, output_token, tokens_bought, max_tokens_sold, deadline, msg.sender, recipient);
    }


    /***********************************|
    |         Getter Functions          |
    |__________________________________*/

    /**
     * @notice Public price function for coin to Token trades with an exact input.
     * @param token address of token bought.
     * @param coin_sold Amount of coin sold.
     * @return Amount of Tokens that can be bought with input coin.
     */
    function getCoinToTokenInputPrice(address token, uint256 coin_sold) public view returns (uint256) {
        require(coin_sold > 0);
        return getInputPrice(coin_sold, coinReserveOf(token), tokenReserveOf(token));
    }

    /**
     * @notice Public price function for coin to Token trades with an exact output.
     * @param token address of token to buy.
     * @param tokens_bought Amount of Tokens bought.
     * @return Amount of coin needed to buy output Tokens.
     */
    function getCoinToTokenOutputPrice(address token, uint256 tokens_bought) public view returns (uint256) {
        require(tokens_bought > 0);
        return getOutputPrice(tokens_bought, coinReserveOf(token), tokenReserveOf(token));
    }

    /**
     * @notice Public price function for Token to coin trades with an exact input.
     * @param token address of token sold.
     * @param tokens_sold Amount of Tokens sold.
     * @return Amount of coin that can be bought with input Tokens.
     */
    function getTokenToCoinInputPrice(address token, uint256 tokens_sold) public view returns (uint256) {
        require(tokens_sold > 0);
        return getInputPrice(tokens_sold, tokenReserveOf(token), coinReserveOf(token));
    }

    /**
     * @notice Public price function for Token to coin trades with an exact output.
     * @param token address of token sold.
     * @param coin_bought Amount of output coin.
     * @return Amount of Tokens needed to buy output coin.
     */
    function getTokenToCoinOutputPrice(address token, uint256 coin_bought) public view returns (uint256) {
        require(coin_bought > 0);
        return getOutputPrice(coin_bought, tokenReserveOf(token), coinReserveOf(token));
    }



    /***********************************|
    |        Liquidity Functions        |
    |__________________________________*/

    /**
     * @notice Deposit coin && Tokens at current ratio to mint liquidity tokens.
     * @dev min_liquidity does nothing when total liquidity supply is 0.
     * @param token Address of Tokens reserved
     * @param reserve_added Amount of coin reserved
     * @param min_liquidity Minium number of liquidity sender will mint if total liquidity supply is greater than 0.
     * @param max_tokens Maxium number of tokens deposited. Deposits max amount if total liquidity supply is 0.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of Liquidity minted
     */
    function addLiquidity(address token, uint256 reserve_added, uint256 min_liquidity, uint256 max_tokens, uint256 deadline) public payable returns (uint256) {
        require(deadline >= block.timestamp && max_tokens > 0 && reserve_added > 0);
        require(token != coin);
        uint256 total_liquidity = totalSupply[uint256(token)];

        if (total_liquidity > 0) {
            require(min_liquidity > 0);
            updateGlobalIndex();
            uint256 token_amount = (reserve_added.mul(tokenReserveOf(token)) / coinReserveOf(token)).add(1);
            uint256 liquidity_minted = reserve_added.mul(total_liquidity) / coinReserveOf(token);
            require(max_tokens >= token_amount && liquidity_minted >= min_liquidity);
            balances[uint256(token)][msg.sender] = balances[uint256(token)][msg.sender].add(liquidity_minted);
            totalSupply[uint256(token)] = total_liquidity.add(liquidity_minted);
            coinReserveShare[token] = coinReserveShare[token].add(reserve_added.mul(1e18)/globalIndex);

            depositAndTrigger(token, msg.sender, token_amount);
            require(doTransferIn(coin, msg.sender, reserve_added));

            emit AddLiquidity(msg.sender, token, reserve_added, token_amount);
            emit TransferSingle(msg.sender, address(0), msg.sender, uint256(token), liquidity_minted);
            return liquidity_minted;

        } else {
            require(reserve_added >= 1000000000);
            uint256 token_amount = max_tokens;
            uint256 initial_liquidity = reserve_added;

            totalSupply[uint256(token)] = initial_liquidity;
            balances[uint256(token)][msg.sender] = initial_liquidity;
            coinReserveShare[token] = coinReserveShare[token].add(reserve_added.mul(1e18)/globalIndex);

            depositAndTrigger(token, msg.sender, token_amount);
            require(doTransferIn(coin, msg.sender, reserve_added));

            emit AddLiquidity(msg.sender, token, reserve_added, token_amount);
            emit TransferSingle(msg.sender, address(0), msg.sender, uint256(token), initial_liquidity);
            return initial_liquidity;
        }
    }

    /**
     * @notice Withdraw coin && Tokens at current ratio to burn liquidity tokens.
     * @dev Burn liquidity tokens to withdraw coin && Tokens at current ratio.
     * @param token Address of Tokens withdrawn.
     * @param amount Amount of liquidity burned.
     * @param min_Coin Minium coin withdrawn.
     * @param min_tokens Minium Tokens withdrawn.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return The amount of coin && Tokens withdrawn.
     */
    function removeLiquidity(address token, uint256 amount, uint256 min_Coin, uint256 min_tokens, uint256 deadline) public returns (uint256, uint256) {
        require(amount > 0 && deadline >= block.timestamp && min_Coin > 0 && min_tokens > 0);
        uint256 total_liquidity = totalSupply[uint256(token)];
        require(total_liquidity > 0);
        updateGlobalIndex();
        uint256 Coin_amount = amount.mul(coinReserveOf(token)) / total_liquidity;
        uint256 token_amount = amount.mul(tokenReserveOf(token)) / total_liquidity;
        require(Coin_amount >= min_Coin && token_amount >= min_tokens);

        balances[uint256(token)][msg.sender] = balances[uint256(token)][msg.sender].sub(amount);
        totalSupply[uint256(token)] = total_liquidity.sub(amount);
        coinReserveShare[token] = coinReserveShare[token].sub(Coin_amount.mul(1e18)/globalIndex);

        checkAndWithdraw(token, msg.sender, token_amount);

        require(doTransferOut(coin, msg.sender, Coin_amount));

        emit RemoveLiquidity(msg.sender, token, Coin_amount, token_amount);
        emit TransferSingle(msg.sender, msg.sender, address(0), uint256(token), amount);
        return (Coin_amount, token_amount);
    }

    /***********************************|
    |         SAFE Token Transfer       |
    |__________________________________*/

    function doTransferIn(address tokenAddr, address from, uint amount) internal returns (bool result) {
        ERC20NonStandard token = ERC20NonStandard(tokenAddr);
        token.transferFrom(from, address(this), amount);

        assembly {
            switch returndatasize()
                case 0 {                      // This is a non-standard ERC-20
                    result := not(0)          // set result to true
                }
                case 32 {                     // This is a complaint ERC-20
                    returndatacopy(0, 0, 32)
                    result := mload(0)        // Set `result = returndata` of external call
                }
                default {                     // This is an excessively non-compliant ERC-20, revert.
                    revert(0, 0)
                }
        }

    }

    function doTransferOut(address tokenAddr, address to, uint amount) internal returns (bool result) {
        ERC20NonStandard token = ERC20NonStandard(tokenAddr);
        token.transfer(to, amount);

        assembly {
            switch returndatasize()
                case 0 {                      // This is a non-standard ERC-20
                    result := not(0)          // set result to true
                }
                case 32 {                     // This is a complaint ERC-20
                    returndatacopy(0, 0, 32)
                    result := mload(0)        // Set `result = returndata` of external call
                }
                default {                     // This is an excessively non-compliant ERC-20, revert.
                    revert(0, 0)
                }
        }

    }

    function doApproval(address tokenAddr, address to, uint amount) internal returns(bool result) {
        ERC20NonStandard token = ERC20NonStandard(tokenAddr);
        token.approve(address(this), to, amount);

        assembly {
            switch returndatasize()
                case 0 {                      // This is a non-standard ERC-20
                    result := not(0)          // set result to true
                }
                case 32 {                     // This is a complaint ERC-20
                    returndatacopy(0, 0, 32)
                    result := mload(0)        // Set `result = returndata` of external call
                }
                default {                     // This is an excessively non-compliant ERC-20, revert.
                    revert(0, 0)
                }
        }        
    }

}
