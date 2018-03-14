﻿exports.newInterval = function newInterval(BOT, UTILITIES, AZURE_FILE_STORAGE, DEBUG_MODULE, POLONIEX_CLIENT_MODULE) {

    let bot = BOT;

    const GMT_SECONDS = ':00.000 GMT+0000';
    const GMT_MILI_SECONDS = '.000 GMT+0000';
    const ONE_DAY_IN_MILISECONDS = 24 * 60 * 60 * 1000;

    const MODULE_NAME = "Interval";
    const LOG_INFO = true;

    const EXCHANGE_NAME = "Poloniex";
    const EXCHANGE_ID = 1;

    const TRADES_FOLDER_NAME = "Trades";

    const CANDLES_FOLDER_NAME = "Candles";
    const CANDLES_ONE_MIN = "One-Min";

    const VOLUMES_FOLDER_NAME = "Volumes";
    const VOLUMES_ONE_MIN = "One-Min";

    const logger = DEBUG_MODULE.newDebugLog();
    logger.fileName = MODULE_NAME;
    logger.bot = bot;

    interval = {
        initialize: initialize,
        start: start
    };

    let charlyAzureFileStorage = AZURE_FILE_STORAGE.newAzureFileStorage(bot);
    let bruceAzureFileStorage = AZURE_FILE_STORAGE.newAzureFileStorage(bot);
    let oliviaAzureFileStorage = AZURE_FILE_STORAGE.newAzureFileStorage(bot);

    let utilities = UTILITIES.newUtilities(bot);

    return interval;

    function initialize(yearAssigend, monthAssigned, callBackFunction) {

        try {

            /* IMPORTANT NOTE:

            We are ignoring in this Interval the received Year and Month. This interval is not depending on Year Month since it procecess the whole market at once.

            */

            logger.fileName = MODULE_NAME;

            const logText = "[INFO] initialize - Entering function 'initialize' ";
            console.log(logText);
            logger.write(logText);

            charlyAzureFileStorage.initialize("Charly");
            bruceAzureFileStorage.initialize("Bruce");
            oliviaAzureFileStorage.initialize("Olivia");

        } catch (err) {

            const logText = "[ERROR] initialize - ' ERROR : " + err.message;
            console.log(logText);
            logger.write(logText);

        }
    }

/*

This process is going to do the following:

Read the candles and volumes from Bruce and produce a single Index File for each market with daily candles and volumes. 

*/

    function start(callBackFunction) {

        try {

            if (LOG_INFO === true) {
                logger.write("[INFO] Entering function 'start'");
            }

            let nextIntervalExecution = false; // This tell weather the Interval module will be executed again or not. By default it will not unless some hole have been found in the current execution.
            let nextIntervalLapse;             // With this we can request the next execution wait time. 

            let market = global.MARKET;

            let lastCandleFile;         // Datetime of the last file included on the Index File.
            let firstTradeFile;         // Datetime of the first trade file in the whole market history.
            let maxCandleFile;          // Datetime of the last file available to be included in the Index File.

            getStatusReport();

            function getStatusReport() {

                try {

                    let reportFilePath;
                    let fileName = "Status.Report." + market.assetA + '_' + market.assetB + ".json"

                    getHistoricTrades();

                    function getHistoricTrades() {

                        /*

                        We need to know where is the begining of the market, since that will help us know where the Index Files should start. 

                        */

                        reportFilePath = EXCHANGE_NAME + "/Processes/" + "Poloniex-Historic-Trades";

                        charlyAzureFileStorage.getTextFile(reportFilePath, fileName, onStatusReportReceived, true);

                        function onStatusReportReceived(text) {

                            let statusReport;

                            try {

                                statusReport = JSON.parse(text);

                                firstTradeFile = new Date(statusReport.lastFile.year + "-" + statusReport.lastFile.month + "-" + statusReport.lastFile.days + " " + statusReport.lastFile.hours + ":" + statusReport.lastFile.minutes + GMT_SECONDS);

                                getOneMinDailyCandlesVolumes();

                            } catch (err) {

                                const logText = "[INFO] 'getStatusReport' - Failed to read main Historic Trades Status Report for market " + market.assetA + '_' + market.assetB + " . Skipping it. ";
                                logger.write(logText);

                                
                            }
                        }
                    }

                    function getOneMinDailyCandlesVolumes() {

                        /* We need to discover the maxCandle file, which is the last file with candles we can use as input. */

                        let date = new Date();
                        let currentYear = date.getUTCFullYear();
                        let currentMonth = utilities.pad(date.getUTCMonth() + 1,2);

                        reportFilePath = EXCHANGE_NAME + "/Processes/" + "One-Min-Daily-Candles-Volumes" + "/" + currentYear + "/" + currentMonth;

                        bruceAzureFileStorage.getTextFile(reportFilePath, fileName, onStatusReportReceived, true);

                        function onStatusReportReceived(text) {

                            let statusReport;

                            try {

                                statusReport = JSON.parse(text);

                                maxCandleFile = new Date(statusReport.lastFile.year + "-" + statusReport.lastFile.month + "-" + statusReport.lastFile.days + " " + "00:00" + GMT_SECONDS);

                                getThisProcessReport();

                            } catch (err) {

                                /*

                                It might happen that the file content is corrupt or it does not exist. In either case we will point our lastCandleFile
                                to the last day of the previous month.

                                */

                                maxCandleFile = new Date(date.valueOf() - ONE_DAY_IN_MILISECONDS);
                                getThisProcessReport();

                            }
                        }
                    }

                    function getThisProcessReport() {

                        /* If the process run and was interrupted, there should be a status report that allows us to resume execution. */

                        reportFilePath = EXCHANGE_NAME + "/Processes/" + bot.process;

                        oliviaAzureFileStorage.getTextFile(reportFilePath, fileName, onStatusReportReceived, true);

                        function onStatusReportReceived(text) {

                            let statusReport;

                            try {

                                statusReport = JSON.parse(text);

                                lastCandleFile = new Date(statusReport.lastFile.year + "-" + statusReport.lastFile.month + "-" + statusReport.lastFile.days + " " + "00:00" + GMT_SECONDS);

                                /*

                                Here we assume that the last day written might contain incomplete information. This actually happens every time the head of the market is reached.
                                For that reason we go back one day, the partial information is discarded and added again with whatever new info is available.

                                */

                                lastCandleFile = new Date(lastCandleFile.valueOf() - ONE_DAY_IN_MILISECONDS); 

                                findPreviousContent();

                            } catch (err) {

                                /*

                                It might happen that the file content is corrupt or it does not exist. In either case we will point our lastCandleFile
                                to the begining of the market.

                                */

                                lastCandleFile = new Date(firstTradeFile.getUTCFullYear() + "-" + (firstTradeFile.getUTCMonth() + 1) + "-" + firstTradeFile.getUTCDate() + " " + "00:00" + GMT_SECONDS);

                                lastCandleFile = new Date(lastCandleFile.valueOf() - ONE_DAY_IN_MILISECONDS); // Go back one day to start well.

                                buildCandles();

                            }
                        }
                    }

                }
                catch (err) {
                    const logText = "[ERROR] 'getStatusReport' - ERROR : " + err.message;
                    logger.write(logText);
                    
                }
            }

            function findPreviousContent() {

                try {

                    let n = 0   // loop Variable representing each possible period as defined at the periods array.

                    let allPreviousCandles = [];
                    let allPreviousVolumes = [];


                    loopBody();

                    function loopBody() {

                        let folderName = global.marketFilesPeriods[n][1];

                        let previousCandles;
                        let previousVolumes;

                        getCandles();

                        function getCandles() {

                            let fileName = '' + market.assetA + '_' + market.assetB + '.json';

                            let filePath = EXCHANGE_NAME + "/Output/" + CANDLES_FOLDER_NAME + "/" + bot.process + "/" + folderName;

                            oliviaAzureFileStorage.getTextFile(filePath, fileName, onFileReceived, true);

                            function onFileReceived(text) {

                                let candlesFile;

                                try {

                                    candlesFile = JSON.parse(text);

                                    previousCandles = candlesFile;

                                    getVolumes();

                                } catch (err) {

                                    const logText = "[ERR] 'findPreviousContent' - Empty or corrupt candle file found at " + filePath + " for market " + market.assetA + '_' + market.assetB + " . Skipping this Market. ";
                                    logger.write(logText);

                                    
                                }
                            }
                        }

                        function getVolumes() {

                            let fileName = '' + market.assetA + '_' + market.assetB + '.json';

                            let filePath = EXCHANGE_NAME + "/Output/" + VOLUMES_FOLDER_NAME + "/" + bot.process + "/" + folderName;

                            oliviaAzureFileStorage.getTextFile(filePath, fileName, onFileReceived, true);

                            function onFileReceived(text) {

                                let volumesFile;

                                try {

                                    volumesFile = JSON.parse(text);

                                    previousVolumes = volumesFile;

                                    allPreviousCandles.push(previousCandles);
                                    allPreviousVolumes.push(previousVolumes);

                                    controlLoop();

                                } catch (err) {

                                    const logText = "[ERR] 'findPreviousContent' - Empty or corrupt volume file found at " + filePath + " for market " + market.assetA + '_' + market.assetB + " . Skipping this Market. ";
                                    logger.write(logText);

                                    
                                }
                            }
                        } 

                    }

                    function controlLoop() {

                        n++;

                        if (n < global.marketFilesPeriods.length) {

                            loopBody();

                        } else {

                            buildCandles(allPreviousCandles, allPreviousVolumes);

                        }
                    }
                }
                catch (err) {
                const logText = "[ERROR] 'findPreviousContent' - ERROR : " + err.message;
                logger.write(logText);
                
                }

            }

            function buildCandles(allPreviousCandles, allPreviousVolumes) {

                try {

                    /*

                    Firstly we prepere the arrays that will accumulate all the information for each output file.

                    */

                    let outputCandles = [];
                    let outputVolumes = [];

                    for (n = 0; n < global.marketFilesPeriods.length; n++) {

                        const emptyArray1 = [];
                        const emptyArray2 = [];

                        outputCandles.push(emptyArray1);
                        outputVolumes.push(emptyArray2);

                    }

                    advanceTime();

                    function advanceTime() {

                        lastCandleFile = new Date(lastCandleFile.valueOf() + ONE_DAY_IN_MILISECONDS);

                        const logText = "[INFO] New processing time @ " + lastCandleFile.getUTCFullYear() + "/" + (lastCandleFile.getUTCMonth() + 1) + "/" + lastCandleFile.getUTCDate() + ".";
                        console.log(logText);
                        logger.write(logText);

                        /* Validation that we are not going past the head of the market. */

                        if (lastCandleFile.valueOf() > maxCandleFile.valueOf()) {

                            nextIntervalExecution = true;  // we request a new interval execution.

                            const logText = "[INFO] 'buildCandles' - Head of the market found @ " + lastCandleFile.getUTCFullYear() + "/" + (lastCandleFile.getUTCMonth() + 1) + "/" + lastCandleFile.getUTCDate() + ".";
                            logger.write(logText);

                            

                            return;

                        }

                        periodsLoop();

                    }

                    function periodsLoop() {

                        /*
        
                        We will iterate through all posible periods.
        
                        */

                        let n = 0   // loop Variable representing each possible period as defined at the periods array.

                        loopBody();

                        function loopBody() {

                            let previousCandles;
                            let previousVolumes;

                            if (allPreviousCandles !== undefined) {

                                previousCandles = allPreviousCandles[n];
                                previousVolumes = allPreviousVolumes[n];

                            }

                            const outputPeriod = global.marketFilesPeriods[n][0];
                            const folderName = global.marketFilesPeriods[n][1];

                            /* Lest see if we are adding previous candles. */

                            if (previousCandles !== undefined) {

                                for (let i = 0; i < previousCandles.length; i++) {

                                    let candle = {
                                        open: previousCandles[i][2],
                                        close: previousCandles[i][3],
                                        min: previousCandles[i][0],
                                        max: previousCandles[i][1],
                                        begin: previousCandles[i][4],
                                        end: previousCandles[i][5]
                                    };

                                    if (candle.end < lastCandleFile.valueOf()) {

                                        outputCandles[n].push(candle);

                                    } else {

                                        const logText = "[WARN] 'buildCandles' - Candle # " + i + " @ " + folderName + " discarded for closing past the current process time.";
                                        logger.write(logText);

                                    }
                                }

                                allPreviousCandles[n] = []; // erasing these so as not to duplicate them.

                            }

                            if (previousVolumes !== undefined) {

                                for (let i = 0; i < previousVolumes.length; i++) {

                                    let volume = {
                                        begin: previousVolumes[i][2],
                                        end: previousVolumes[i][3],
                                        buy: previousVolumes[i][0],
                                        sell: previousVolumes[i][1]
                                    };

                                    if (volume.end < lastCandleFile.valueOf()) {

                                        outputVolumes[n].push(volume);

                                    } else {

                                        const logText = "[WARN] 'buildCandles' - Volume # " + i + " @ " + folderName + " discarded for closing past the current process time.";
                                        logger.write(logText);

                                    }


                                }

                                allPreviousVolumes[n] = []; // erasing these so as not to duplicate them.

                            }

                            nextCandleFile();

                            function nextCandleFile() {

                                let dateForPath = lastCandleFile.getUTCFullYear() + '/' + utilities.pad(lastCandleFile.getUTCMonth() + 1, 2) + '/' + utilities.pad(lastCandleFile.getUTCDate(), 2);
                                let fileName = market.assetA + '_' + market.assetB + ".json"
                                let filePath = EXCHANGE_NAME + "/Output/" + CANDLES_FOLDER_NAME + '/' + CANDLES_ONE_MIN + '/' + dateForPath;

                                bruceAzureFileStorage.getTextFile(filePath, fileName, onFileReceived, true);

                                function onFileReceived(text) {

                                    let candlesFile;

                                    try {

                                        candlesFile = JSON.parse(text);

                                    } catch (err) {

                                        const logText = "[ERR] 'buildCandles' - Empty or corrupt candle file found at " + filePath + " for market " + market.assetA + '_' + market.assetB + " . Skipping this Market. ";
                                        logger.write(logText);

                                        

                                        nextIntervalExecution = true;  // we request a new interval execution.
                                        nextIntervalLapse = 30000;      

                                        return;
                                    }

                                    const inputCandlesPerdiod = 60 * 1000;              // 1 min
                                    const inputFilePeriod = 24 * 60 * 60 * 1000;        // 24 hs

                                    let totalOutputCandles = inputFilePeriod / outputPeriod; // this should be 2 in this case.
                                    let beginingOutputTime = lastCandleFile.valueOf();

                                    for (let i = 0; i < totalOutputCandles; i++) {

                                        let outputCandle = {
                                            open: 0,
                                            close: 0,
                                            min: 0,
                                            max: 0,
                                            begin: 0,
                                            end: 0
                                        };

                                        let saveCandle = false;

                                        outputCandle.begin = beginingOutputTime + i * outputPeriod;
                                        outputCandle.end = beginingOutputTime + (i + 1) * outputPeriod - 1;

                                        for (let j = 0; j < candlesFile.length; j++) {

                                            let candle = {
                                                open: candlesFile[j][2],
                                                close: candlesFile[j][3],
                                                min: candlesFile[j][0],
                                                max: candlesFile[j][1],
                                                begin: candlesFile[j][4],
                                                end: candlesFile[j][5]
                                            };

                                            /* Here we discard all the candles out of range.  */

                                            if (candle.begin >= outputCandle.begin && candle.end <= outputCandle.end) {

                                                if (saveCandle === false) { // this will set the value only once.

                                                    outputCandle.open = candle.open;
                                                    outputCandle.min = candle.min;
                                                    outputCandle.max = candle.max;

                                                }

                                                saveCandle = true;

                                                outputCandle.close = candle.close;      // only the last one will be saved

                                                if (candle.min < outputCandle.min) {

                                                    outputCandle.min = candle.min;

                                                }

                                                if (candle.max > outputCandle.max) {

                                                    outputCandle.max = candle.max;

                                                }
                                            }
                                        }

                                        if (saveCandle === true) {      // then we have a valid candle, otherwise it means there were no candles to fill this one in its time range.

                                            outputCandles[n].push(outputCandle);

                                        }
                                    }

                                    nextVolumeFile();

                                }
                            }

                            function nextVolumeFile() {

                                let dateForPath = lastCandleFile.getUTCFullYear() + '/' + utilities.pad(lastCandleFile.getUTCMonth() + 1, 2) + '/' + utilities.pad(lastCandleFile.getUTCDate(), 2);
                                let fileName = market.assetA + '_' + market.assetB + ".json"
                                let filePath = EXCHANGE_NAME + "/Output/" + VOLUMES_FOLDER_NAME + '/' + VOLUMES_ONE_MIN + '/' + dateForPath;

                                bruceAzureFileStorage.getTextFile(filePath, fileName, onFileReceived, true);

                                function onFileReceived(text) {

                                    let volumesFile;

                                    try {

                                        volumesFile = JSON.parse(text);

                                    } catch (err) {

                                        const logText = "[ERR] 'buildCandles' - Empty or corrupt candle file found at " + filePath + " for market " + market.assetA + '_' + market.assetB + " . Skipping this Market. ";
                                        logger.write(logText);

                                        

                                        return;
                                    }

                                    const inputVolumesPerdiod = 60 * 1000;              // 1 min
                                    const inputFilePeriod = 24 * 60 * 60 * 1000;        // 24 hs

                                    let totalOutputVolumes = inputFilePeriod / outputPeriod; // this should be 2 in this case.
                                    let beginingOutputTime = lastCandleFile.valueOf();

                                    for (let i = 0; i < totalOutputVolumes; i++) {

                                        let outputVolume = {
                                            buy: 0,
                                            sell: 0,
                                            begin: 0,
                                            end: 0
                                        };

                                        let saveVolume = false;

                                        outputVolume.begin = beginingOutputTime + i * outputPeriod;
                                        outputVolume.end = beginingOutputTime + (i + 1) * outputPeriod - 1;

                                        for (let j = 0; j < volumesFile.length; j++) {

                                            let volume = {
                                                buy: volumesFile[j][0],
                                                sell: volumesFile[j][1],
                                                begin: volumesFile[j][2],
                                                end: volumesFile[j][3]
                                            };

                                            /* Here we discard all the Volumes out of range.  */

                                            if (volume.begin >= outputVolume.begin && volume.end <= outputVolume.end) {

                                                saveVolume = true;

                                                outputVolume.buy = outputVolume.buy + volume.buy;
                                                outputVolume.sell = outputVolume.sell + volume.sell;

                                            }
                                        }

                                        if (saveVolume === true) {

                                            outputVolumes[n].push(outputVolume);

                                        }
                                    }

                                    writeFiles(outputCandles[n], outputVolumes[n], folderName, controlLoop);

                                }
                            }
                        }

                        function controlLoop() {

                            n++;

                            if (n < global.marketFilesPeriods.length) {

                                loopBody();

                            } else {

                                writeStatusReport(lastCandleFile, advanceTime);

                            }
                        }
                    }
                }

                catch (err) {
                    const logText = "[ERROR] 'buildCandles' - ERROR : " + err.message;
                    logger.write(logText);
                    
                }

            }

            function writeFiles(candles, volumes, folderName, callBack) {

                /*

                Here we will write the contents of the Candles and Volumens files.

                */

                try {

                    writeCandles();

                    function writeCandles() {

                        let separator = "";
                        let fileRecordCounter = 0;

                        let fileContent = "";

                        for (i = 0; i < candles.length; i++) {

                            let candle = candles[i];

                            fileContent = fileContent + separator + '[' + candles[i].min + "," + candles[i].max + "," + candles[i].open + "," + candles[i].close + "," + candles[i].begin + "," + candles[i].end + "]";

                            if (separator === "") { separator = ","; }

                            fileRecordCounter++;

                        }

                        fileContent = "[" + fileContent + "]";

                        let fileName = '' + market.assetA + '_' + market.assetB + '.json';

                        let filePath = EXCHANGE_NAME + "/Output/" + CANDLES_FOLDER_NAME + "/" + bot.process + "/" + folderName;

                        utilities.createFolderIfNeeded(filePath, oliviaAzureFileStorage, onFolderCreated);

                        function onFolderCreated() {

                            oliviaAzureFileStorage.createTextFile(filePath, fileName, fileContent + '\n', onFileCreated);

                            function onFileCreated() {

                                const logText = "[WARN] Finished with File @ " + market.assetA + "_" + market.assetB + ", " + fileRecordCounter + " records inserted into " + filePath + "/" + fileName + "";
                                console.log(logText);
                                logger.write(logText);

                                writeVolumes();
                            }
                        }

                    }

                    function writeVolumes() {

                        let separator = "";
                        let fileRecordCounter = 0;

                        let fileContent = "";

                        for (i = 0; i < volumes.length; i++) {

                            let candle = volumes[i];

                            fileContent = fileContent + separator + '[' + volumes[i].buy + "," + volumes[i].sell + "," + volumes[i].begin + "," + volumes[i].end + "]";

                            if (separator === "") { separator = ","; }

                            fileRecordCounter++;

                        }

                        fileContent = "[" + fileContent + "]";

                        let fileName = '' + market.assetA + '_' + market.assetB + '.json';

                        let filePath = EXCHANGE_NAME + "/Output/" + VOLUMES_FOLDER_NAME + "/" + bot.process + "/" + folderName;

                        utilities.createFolderIfNeeded(filePath, oliviaAzureFileStorage, onFolderCreated);

                        function onFolderCreated() {

                            oliviaAzureFileStorage.createTextFile(filePath, fileName, fileContent + '\n', onFileCreated);

                            function onFileCreated() {

                                const logText = "[WARN] Finished with File @ " + market.assetA + "_" + market.assetB + ", " + fileRecordCounter + " records inserted into " + filePath + "/" + fileName + "";
                                console.log(logText);
                                logger.write(logText);

                                callBack();
                            }
                        }
                    }
                }
                     
                catch (err) {
                    const logText = "[ERROR] 'writeFiles' - ERROR : " + err.message;
                logger.write(logText);
                
                }
            }

            function writeStatusReport(lastFileDate, callBack) {

                if (LOG_INFO === true) {
                    logger.write("[INFO] Entering function 'writeStatusReport'");
                }

                try {

                    let reportFilePath = EXCHANGE_NAME + "/Processes/" + bot.process;

                    utilities.createFolderIfNeeded(reportFilePath, oliviaAzureFileStorage, onFolderCreated);

                    function onFolderCreated() {

                        try {

                            let fileName = "Status.Report." + market.assetA + '_' + market.assetB + ".json";

                            let report = {
                                lastFile: {
                                    year: lastFileDate.getUTCFullYear(),
                                    month: (lastFileDate.getUTCMonth() + 1),
                                    days: lastFileDate.getUTCDate()
                                }
                            };

                            let fileContent = JSON.stringify(report); 

                            oliviaAzureFileStorage.createTextFile(reportFilePath, fileName, fileContent + '\n', onFileCreated);

                            function onFileCreated() {

                                if (LOG_INFO === true) {
                                    logger.write("[INFO] 'writeStatusReport' - Content written: " + fileContent);
                                }

                                callBack();
                            }
                        }
                        catch (err) {
                            const logText = "[ERROR] 'writeStatusReport - onFolderCreated' - ERROR : " + err.message;
                            logger.write(logText);
                            
                        }
                    }

                }
                catch (err) {
                    const logText = "[ERROR] 'writeStatusReport' - ERROR : " + err.message;
                    logger.write(logText);
                    
                }

            }

        }
        catch (err) {
            const logText = "[ERROR] 'Start' - ERROR : " + err.message;
            logger.write(logText);
        }
    }
};
