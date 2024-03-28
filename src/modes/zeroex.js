const axios = require("axios");
const ethers = require("ethers");
const { arbAbis, orderbookAbi } = require("../abis");
const { sleep, getIncome, getActualPrice, bundleTakeOrders, promiseTimeout } = require("../utils");


const HEADERS = { headers: { "accept-encoding": "null" } };

/**
 * Main function that gets order details from subgraph, bundles the ones that have balance and tries clearing them with 0x
 *
 * @param {object} config - The configuration object
 * @param {any[]} ordersDetails - The order details queried from subgraph
 * @param {string} gasCoveragePercentage - (optional) The percentage of the gas cost to cover on each transaction for it to be considered profitable and get submitted
 * @returns The report of details of cleared orders
 */
const zeroExClear = async(
    config,
    ordersDetails,
    gasCoveragePercentage = "100"
) => {
    if (
        gasCoveragePercentage < 0 ||
        !Number.isInteger(Number(gasCoveragePercentage))
    ) throw "invalid gas coverage percentage, must be an integer greater than equal 0";

    let rateLimit;
    if (config.monthlyRatelimit !== undefined) {
        const _val = Number(config.monthlyRatelimit);
        if (Number.isInteger(_val) && _val > 0) rateLimit = Number((_val / 2592).toFixed()) / 1000;
        else throw new Error("specified monthly ratelimit must be an integer greater than 0");
    }

    let hits = 0;
    const start = Date.now();
    const signer            = config.signer;
    const api               = config.zeroEx.apiUrl;
    const proxyAddress      = config.zeroEx.proxyAddress;
    const arbAddress        = config.arbAddress;
    const orderbookAddress  = config.orderbookAddress;
    const arbType           = config.arbType;
    // const nativeToken       = config.nativeWrappedToken;
    const flashbotSigner    = config.flashbotRpc
        ? new ethers.Wallet(
            signer.privateKey,
            new ethers.providers.JsonRpcProvider(config.flashbotRpc)
        )
        : undefined;

    // set the api key in headers
    if (config.apiKey) HEADERS.headers["0x-api-key"] = config.apiKey;
    else throw "invalid 0x API key";

    // instantiating arb contract
    const arb = new ethers.Contract(arbAddress, arbAbis[arbType], signer);

    // instantiating orderbook contract
    const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi, signer);

    console.log(
        "------------------------- Starting The",
        "\x1b[32m0x\x1b[0m",
        "Mode -------------------------",
        "\n"
    );
    console.log("\x1b[33m%s\x1b[0m", Date());
    console.log("Arb Contract Address: " , arbAddress);
    console.log("OrderBook Contract Address: " , orderbookAddress, "\n");

    // const initPriceQueries = [];
    let bundledOrders = [];

    if (ordersDetails.length) {
        console.log(
            "------------------------- Bundling Orders -------------------------", "\n"
        );
        bundledOrders = await bundleTakeOrders(
            ordersDetails,
            orderbook,
            arb,
            undefined,
            config.rpc !== "test",
            config.interpreterv2,
            config.bundle
        );
        // for (let i = 0; i < bundledOrders.length; i++) {
        //     build0xQueries(
        //         api,
        //         initPriceQueries,
        //         bundledOrders[i].sellToken,
        //         bundledOrders[i].sellTokenDecimals,
        //         bundledOrders[i].sellTokenSymbol
        //     );
        //     build0xQueries(
        //         api,
        //         initPriceQueries,
        //         bundledOrders[i].buyToken,
        //         bundledOrders[i].buyTokenDecimals,
        //         bundledOrders[i].buyTokenSymbol
        //     );
        // }
    }
    else {
        console.log("No orders found, exiting...", "\n");
        return;
    }

    if (!bundledOrders.length) {
        console.log("Could not find any order with sufficient balance, exiting...", "\n");
        return;
    }

    // console.log(
    //     "------------------------- Getting Best Deals From 0x -------------------------",
    //     "\n"
    // );
    // if (Array.isArray(initPriceQueries[initPriceQueries.length - 1])) {
    //     initPriceQueries[initPriceQueries.length - 1] = {
    //         quote: `${
    //             api
    //         }swap/v1/price?buyToken=${
    //             nativeToken.address.toLowerCase()
    //         }&sellToken=${
    //             initPriceQueries[initPriceQueries.length - 1][0]
    //         }&sellAmount=${
    //             "1" + "0".repeat(initPriceQueries[initPriceQueries.length - 1][1])
    //         }`,
    //         tokens: [
    //             nativeToken.symbol,
    //             initPriceQueries[initPriceQueries.length - 1][2],
    //             nativeToken.address.toLowerCase(),
    //             initPriceQueries[initPriceQueries.length - 1][0],
    //             nativeToken.decimals,
    //             initPriceQueries[initPriceQueries.length - 1][1],
    //         ]
    //     };
    // }
    // hits += initPriceQueries.length;
    // bundledOrders = await prepare(
    //     initPriceQueries,
    //     bundledOrders
    // );

    if (bundledOrders.length === 0) {
        console.log("Could not find any order to clear for current market price, exiting...", "\n");
        return;
    }

    const report = [];
    for (let i = 0; i < bundledOrders.length; i++) {
        await sleep(1000);
        if (bundledOrders[i].takeOrders.length) {
            try {
                console.log(
                    `------------------------- Trying To Clear ${
                        bundledOrders[i].buyTokenSymbol
                    }/${
                        bundledOrders[i].sellTokenSymbol
                    } -------------------------`,
                    "\n"
                );
                console.log(`Buy Token Address: ${bundledOrders[i].buyToken}`);
                console.log(`Sell Token Address: ${bundledOrders[i].sellToken}`, "\n");

                console.log(">>> Updating vault balances...", "\n");
                const newBalances = await Promise.allSettled(
                    bundledOrders[i].takeOrders.map(async(v) => {
                        return ethers.utils.parseUnits(
                            ethers.utils.formatUnits(
                                await orderbook.vaultBalance(
                                    v.takeOrder.order.owner,
                                    bundledOrders[i].sellToken,
                                    v.takeOrder.order.validOutputs[
                                        v.takeOrder.outputIOIndex
                                    ].vaultId
                                ),
                                bundledOrders[i].sellTokenDecimals
                            )
                        );
                    })
                );
                newBalances.forEach((v, j) => {
                    if (v.status === "fulfilled") {
                        if (v.value.isZero()) {
                            bundledOrders[i].takeOrders[j].quoteAmount = ethers.BigNumber.from("0");
                        }
                        else {
                            if (v.value.lt(bundledOrders[i].takeOrders[j].quoteAmount)) {
                                bundledOrders[i].takeOrders[j].quoteAmount = v.value;
                            }
                        }
                    }
                    else {
                        console.log(`Could not get vault balance for order ${
                            bundledOrders[i].takeOrders[j].id
                        } due to:`);
                        console.log(v.reason);
                        bundledOrders[i].takeOrders[j].quoteAmount = ethers.BigNumber.from("0");
                    }
                });
                bundledOrders[i].takeOrders = bundledOrders[i].takeOrders.filter(
                    v => !v.quoteAmount.isZero()
                );

                if (bundledOrders[i].takeOrders.length) {
                    console.log(">>> Getting current price for this token pair...", "\n");

                    let cumulativeAmount = ethers.constants.Zero;
                    bundledOrders[i].takeOrders.forEach(v => {
                        cumulativeAmount = cumulativeAmount.add(v.quoteAmount);
                    });
                    const price = (await axios.get(
                        `${
                            api
                        }swap/v1/price?buyToken=${
                            bundledOrders[i].buyToken
                        }&sellToken=${
                            bundledOrders[i].sellToken
                        }&sellAmount=${
                            cumulativeAmount.div(
                                "1" + "0".repeat(18 - bundledOrders[i].sellTokenDecimals)
                            ).div(2).toString()
                        }`,
                        HEADERS
                    ))?.data?.price;
                    hits++;
                    await sleep(1000);
                    const currentPrice = ethers.utils.parseUnits(price);

                    console.log(`Quote amount: ${ethers.utils.formatUnits(
                        cumulativeAmount.div(
                            "1" + "0".repeat(18 - bundledOrders[i].sellTokenDecimals)
                        ).div(2),
                        bundledOrders[i].sellTokenDecimals
                    )} ${bundledOrders[i].sellTokenSymbol}`);
                    console.log(`Current market price of this token pair: ${price}`);
                    console.log("Current ratio of the orders in this token pair:");
                    bundledOrders[i].takeOrders.forEach(v => {
                        console.log(ethers.utils.formatEther(v.ratio));
                    });

                    console.log(
                        "\n>>> Filtering the bundled orders of this token pair with lower ratio than current market price...",
                        "\n"
                    );

                    bundledOrders[i].takeOrders = bundledOrders[i].takeOrders.filter(
                        v => currentPrice.gte(v.ratio)
                    );

                    if (bundledOrders[i].takeOrders.length) {
                        cumulativeAmount = ethers.constants.Zero;
                        bundledOrders[i].takeOrders.forEach(v => {
                            cumulativeAmount = cumulativeAmount.add(v.quoteAmount);
                        });

                        const bundledQuoteAmount = cumulativeAmount.div(
                            "1" + "0".repeat(18 - bundledOrders[i].sellTokenDecimals)
                        );

                        console.log(">>> Getting quote for this token pair...", "\n");
                        const response = await axios.get(
                            `${
                                api
                            }swap/v1/quote?buyToken=${
                                bundledOrders[i].buyToken
                            }&sellToken=${
                                bundledOrders[i].sellToken
                            }&sellAmount=${
                                bundledQuoteAmount.toString()
                            }`,
                            HEADERS
                        );
                        hits++;

                        const txQuote = response?.data;
                        if (txQuote) {
                            // console.log("the full quote that will be submitted is:" + "\n" + JSON.stringify(txQuote, null, 2), "\n");
                            const takeOrdersConfigStruct = {
                                output: bundledOrders[i].buyToken,
                                input: bundledOrders[i].sellToken,
                                // max and min input should be exactly the same as quoted sell amount
                                // this makes sure the cleared order amount will exactly match the 0x quote
                                minimumInput: bundledQuoteAmount,
                                maximumInput: bundledQuoteAmount,
                                maximumIORatio: ethers.constants.MaxUint256,
                                orders: bundledOrders[i].takeOrders.map(v => v.takeOrder),
                            };
                            if (/^flash-loan-v3$|^order-taker$/.test(arbType)) {
                                takeOrdersConfigStruct.data = "0x";
                                delete takeOrdersConfigStruct.output;
                                delete takeOrdersConfigStruct.input;
                            }

                            // submit the transaction
                            try {
                                const exchangeData = ethers.utils.defaultAbiCoder.encode(
                                    ["address", "address", "bytes"],
                                    [txQuote.allowanceTarget, proxyAddress, txQuote.data]
                                );
                                if (arbType === "order-taker") takeOrdersConfigStruct.data = exchangeData;
                                const rawtx = {
                                    data: arb.interface.encodeFunctionData(
                                        "arb",
                                        arbType === "order-taker"
                                            ? [
                                                takeOrdersConfigStruct,
                                                "0"
                                            ]
                                            : [
                                                takeOrdersConfigStruct,
                                                "0",
                                                exchangeData
                                            ]
                                    ),
                                    to: arb.address,
                                    gasPrice: txQuote.gasPrice
                                };
                                console.log("Block Number: " + await signer.provider.getBlockNumber(), "\n");
                                let gasLimit = await signer.estimateGas(rawtx);
                                gasLimit = gasLimit.mul("112").div("100");
                                rawtx.gasLimit = gasLimit;
                                const gasCost = gasLimit.mul(txQuote.gasPrice);
                                const gasCostInToken = ethers.utils.parseUnits(
                                    txQuote.buyTokenToEthRate
                                ).mul(
                                    gasCost
                                ).div(
                                    "1" + "0".repeat(
                                        36 - bundledOrders[i].buyTokenDecimals
                                    )
                                );
                                if (gasCoveragePercentage !== "0") {
                                    const headroom = (
                                        Number(gasCoveragePercentage) * 1.2
                                    ).toFixed();
                                    rawtx.data = arb.interface.encodeFunctionData(
                                        "arb",
                                        arbType === "order-taker"
                                            ? [
                                                takeOrdersConfigStruct,
                                                gasCostInToken.mul(headroom).div("100")
                                            ]
                                            : [
                                                takeOrdersConfigStruct,
                                                gasCostInToken.mul(headroom).div("100"),
                                                exchangeData
                                            ]
                                    );
                                    await signer.estimateGas(rawtx);
                                }

                                try {
                                    console.log(">>> Trying to submit the transaction for this token pair...", "\n");
                                    rawtx.data = arb.interface.encodeFunctionData(
                                        "arb",
                                        arbType === "order-taker"
                                            ? [
                                                takeOrdersConfigStruct,
                                                gasCostInToken.mul(gasCoveragePercentage).div("100")
                                            ]
                                            : [
                                                takeOrdersConfigStruct,
                                                gasCostInToken.mul(gasCoveragePercentage).div("100"),
                                                exchangeData
                                            ]
                                    );
                                    console.log("Block Number: " + await signer.provider.getBlockNumber(), "\n");
                                    const tx = config.timeout
                                        ? await promiseTimeout(
                                            (flashbotSigner !== undefined
                                                ? flashbotSigner.sendTransaction(rawtx)
                                                : signer.sendTransaction(rawtx)),
                                            config.timeout,
                                            `Transaction failed to get submitted after ${config.timeout}ms`
                                        )
                                        : flashbotSigner !== undefined
                                            ? await flashbotSigner.sendTransaction(rawtx)
                                            : await signer.sendTransaction(rawtx);

                                    console.log("\x1b[33m%s\x1b[0m", config.explorer + "tx/" + tx.hash, "\n");
                                    console.log(
                                        ">>> Transaction submitted successfully to the network, waiting for transaction to mine...",
                                        "\n"
                                    );
                                    console.log(tx);
                                    const receipt = config.timeout
                                        ? await promiseTimeout(
                                            tx.wait(),
                                            config.timeout,
                                            `Transaction failed to mine after ${config.timeout}ms`
                                        )
                                        : await tx.wait();

                                    const income = getIncome(signer, receipt);
                                    const clearActualPrice = getActualPrice(
                                        receipt,
                                        orderbookAddress,
                                        arbAddress,
                                        cumulativeAmount,
                                        bundledOrders[i].buyTokenDecimals
                                    );
                                    const actualGasCost = ethers.BigNumber.from(
                                        receipt.effectiveGasPrice
                                    ).mul(receipt.gasUsed);
                                    const actualGasCostInToken = ethers.utils.parseUnits(
                                        txQuote.buyTokenToEthRate
                                    ).mul(
                                        actualGasCost
                                    ).div(
                                        "1" + "0".repeat(
                                            36 - bundledOrders[i].buyTokenDecimals
                                        )
                                    );
                                    const netProfit = income
                                        ? income.sub(actualGasCostInToken)
                                        : undefined;
                                    console.log(
                                        "\x1b[34m%s\x1b[0m",
                                        `${bundledOrders[i].takeOrders.length} orders cleared successfully!`,
                                        "\n"
                                    );
                                    console.log("\x1b[36m%s\x1b[0m", `Clear Quote Price: ${txQuote.price}`);
                                    console.log("\x1b[36m%s\x1b[0m", `Clear Actual Price: ${clearActualPrice}`);
                                    console.log("\x1b[36m%s\x1b[0m", `Clear Amount: ${
                                        ethers.utils.formatUnits(
                                            bundledQuoteAmount,
                                            bundledOrders[i].sellTokenDecimals
                                        )
                                    } ${bundledOrders[i].sellTokenSymbol}`);
                                    console.log("\x1b[36m%s\x1b[0m", `Consumed Gas: ${
                                        ethers.utils.formatEther(actualGasCost)
                                    } ${
                                        config.nativeToken.symbol
                                    }`, "\n");
                                    if (income) {
                                        console.log("\x1b[35m%s\x1b[0m", `Gross Income: ${ethers.utils.formatUnits(
                                            income,
                                            bundledOrders[i].buyTokenDecimals
                                        )} ${bundledOrders[i].buyTokenSymbol}`);
                                        console.log("\x1b[35m%s\x1b[0m", `Net Profit: ${ethers.utils.formatUnits(
                                            netProfit,
                                            bundledOrders[i].buyTokenDecimals
                                        )} ${bundledOrders[i].buyTokenSymbol}`, "\n");
                                    }

                                    report.push({
                                        transactionHash: receipt.transactionHash,
                                        tokenPair:
                                            bundledOrders[i].buyTokenSymbol +
                                            "/" +
                                            bundledOrders[i].sellTokenSymbol,
                                        buyToken: bundledOrders[i].buyToken,
                                        buyTokenDecimals: bundledOrders[i].buyTokenDecimals,
                                        sellToken: bundledOrders[i].sellToken,
                                        sellTokenDecimals: bundledOrders[i].sellTokenDecimals,
                                        clearedAmount: bundledQuoteAmount.toString(),
                                        clearPrice: txQuote.price,
                                        clearGuaranteedPrice: txQuote.guaranteedPrice,
                                        clearActualPrice,
                                        gasUsed: receipt.gasUsed,
                                        gasCost: actualGasCost,
                                        income,
                                        netProfit,
                                        clearedOrders: bundledOrders[i].takeOrders.map(
                                            v => v.id
                                        ),
                                    });
                                }
                                catch (error) {
                                    console.log("\x1b[31m%s\x1b[0m", ">>> Transaction execution failed due to:");
                                    console.log(error, "\n");
                                }
                            }
                            catch (error) {
                                if (error === "dryrun" || error === "nomatch") {
                                    console.log("\x1b[31m%s\x1b[0m", ">>> Transaction dry run failed, skipping...");
                                }
                                else {
                                    console.log("\x1b[31m%s\x1b[0m", ">>> Transaction failed due to:");
                                    console.log(error, "\n");
                                }
                            }
                        }
                        else console.log("\x1b[31m%s\x1b[0m", "Failed to get quote from 0x", "\n");
                    }
                    else console.log(
                        "All orders of this token pair have higher ratio than current market price, checking next token pair...",
                        "\n"
                    );
                }
                else console.log("All orders of this token pair have empty vault balance, skipping...", "\n");
            }
            catch (error) {
                console.log("\x1b[31m%s\x1b[0m", ">>> Failed to get quote from 0x due to:", "\n");
                console.log(error.message);
                console.log("data:");
                console.log(JSON.stringify(error.response.data, null, 2), "\n");
            }
        }
    }
    console.log("---------------------------------------------------------------------------", "\n");

    // wait to stay within montly ratelimit
    if (rateLimit) {
        const rateLimitDuration = Number((((hits / rateLimit) * 1000) + 1).toFixed());
        const duration = Date.now() - start;
        console.log(`Executed in ${duration} miliseconds with ${hits} 0x api calls`);
        const msToWait = rateLimitDuration - duration;
        if (msToWait > 0) {
            console.log(`Waiting ${msToWait} more miliseconds to stay within monthly rate limit...`);
            await sleep(msToWait);
        }
        console.log("---------------------------------------------------------------------------", "\n");
    }
    return report;
};

module.exports = {
    zeroExClear
};