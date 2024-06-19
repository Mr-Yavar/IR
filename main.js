const fs = require("fs");
const readline = require("readline");
// Load wink-nlp package.
const winkNLP = require('wink-nlp');
// Load english language model.
const model = require('wink-eng-lite-web-model');
// Instantiate winkNLP.
const nlp = winkNLP(model);
// Obtain "its" helper to extract item properties.
const its = nlp.its;
// Obtain "as" reducer helper to reduce a collection.
const as = nlp.as;
var nlpUtils = require('wink-nlp-utils');


const Documents = {};//همه اسناد
const DocumentTokens = {};//توکنهای هر سند
const TokensDoc = {};// اسناد هر توکن - inverted index
const sortedTokensDoc = {};// مرتب شده inverted index با ترم ها
const allTokens = [];//همه توکن ها




const N = 1460;
// واکشی اسناد از دیتاست
async function processLineByLine(fileName) {
    const fileStream = fs.createReadStream(fileName);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    // Note: we use the crlfDelay option to recognize all instances of CR LF
    // ('\r\n') in input.txt as a single line break.

    let flagDocId = false;
    let flagDoc = false;

    let docId = "";
    let doc = "";

    for await (const line of rl) {
        // Each line in input.txt will be successively available here as `line`.
        if (line.startsWith(".I") && !flagDocId) {
            flagDoc = false;
            flagDocId = true;
            docId = line.replace(".I", "").trim();
        }


        if (line.startsWith(".W") && flagDocId) {
            flagDoc = true;
            doc = line.replace(".W", "").trim();
        } else if (flagDoc)
            doc += " " + line.trim();

        if (line.startsWith(".X")) {
            flagDoc = false;
            flagDocId = false;

            Documents[docId] = doc.replace(".X", "").trim();
            doc = "";
        }

    }
}


(async function () {
    //خواندن اسناد
    await processLineByLine("./CISI.ALL");
    await fs.writeFile('0-Docs.txt', JSON.stringify(Documents, null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });

    //ایجاد inverted index
    for (let docId in Documents) {
        // توکن کردن
        let tokens = nlp.readDoc(Documents[docId].toLowerCase()).tokens().out(its.lemma).map(token => {
                if (token !== undefined) {

                    if (!isNaN(Number(token.trim())))
                        return token.trim();
                    let temp = token.trim().replaceAll("(", "")
                        .replaceAll("{", "")
                        .replaceAll("[", "").replaceAll(")", "")
                        .replaceAll("}", "").replaceAll("]", "")
                        .replaceAll("\\", "").replaceAll("//", "")
                        .replaceAll(";", "")
                        .replaceAll('"', "").replaceAll("-", "")
                        .replaceAll("'", "").replaceAll(",", "")
                        .replaceAll("?", "").replaceAll("*", "")
                        .replaceAll("+", "").replaceAll(":", "")
                        .replaceAll(/[.]{2,}/g, "").replaceAll(/[0-9]/g, "");

                    if (!isNaN(Number(temp)))
                        return "";
                    return temp;

                } else
                    return "";
            }
        ).filter(x => x.length !== 0);
        DocumentTokens[docId] = tokens;
        // تشکیل posting list برای هر توکن
        for (let token of tokens) {
            if (TokensDoc[token] === undefined)
                TokensDoc[token] = [Number(docId)];
            else {
                if (!TokensDoc[token].includes(Number(docId)))
                    TokensDoc[token] = [...TokensDoc[token], Number(docId)];
            }
        }
    }

    // مرتب سازی لیست شناسه اسناد
    for (let token in TokensDoc) {
        TokensDoc[token] = TokensDoc[token].sort((a, b) => a < b ? -1 : 1);
    }

    //مرتب سازی لیست ترم ها
    Object.keys(TokensDoc).sort().forEach(function (v, i) {
        sortedTokensDoc[v] = TokensDoc[v];
    });

    //ذخیره سازی در فایل
    await fs.writeFile('1&2-InvertedIndex.txt', JSON.stringify(sortedTokensDoc, null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });
    
    //ذخیره سازی در فایل
    await fs.writeFile('0-DocumentTokens.txt', JSON.stringify(DocumentTokens, null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });
    //حذف حرفهای اضافه
    const filteredInvertedList = {};
    nlpUtils.tokens.removeWords(Object.keys(TokensDoc)).forEach((token) => {
        filteredInvertedList[token] = TokensDoc[token];
    });

    allTokens.push(...(Object.keys(filteredInvertedList)));

    await fs.writeFile('3-after-filter-stopwords.txt', JSON.stringify(filteredInvertedList, null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });

    // پارامترهای tf و df
    const parametersForTokens = {
        "df": {}, // df : تعداد اسناد شامل عبارت t
        "tf": {} // tf : تعداد دفعاتی که کلمه t در سند d آمده
    };

    for (let token of Object.keys(filteredInvertedList)) {

        parametersForTokens["df"][token] = filteredInvertedList[token].length;

        for (let docId in Documents) {
            if (parametersForTokens["tf"][token] === undefined)
                parametersForTokens["tf"][token] = {};

            let ptrn = new RegExp(String.raw`\s${token}\s`, "g");

            parametersForTokens["tf"][token][docId] = (DocumentTokens[docId].join(" ").match(ptrn, "g") || []).length;
        }
    }


    await fs.writeFile('4-Parameters.txt', JSON.stringify(parametersForTokens, null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });





    const idfs ={};
    for(let item of allTokens){
        idfs[item] =  Math.log10(1460/parametersForTokens["df"][item]);
    }
    await fs.writeFile('5-IDFS.txt', JSON.stringify(idfs, null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });

    const tf_wf = {};

    for(let docId in DocumentTokens){

        tf_wf[docId] = {};
        for(let token of allTokens) {

            tf_wf[docId][token] = (parametersForTokens["tf"][token][docId] !==undefined && parametersForTokens["tf"][token][docId]>0) ? (1+Math.log10(parametersForTokens["tf"][token][docId])) : 0;
        }
    }
    await fs.writeFile('6-TF-Weight.txt', JSON.stringify(tf_wf, null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });

    let queryToken = nlp.readDoc("I am interested in studing computer engineering at university").tokens().out(its.lemma);
    let filtredQueryToken = nlpUtils.tokens.removeWords(queryToken);

    const tf_wf_q = {};
    filtredQueryToken.map((token)=>{
        let ptrn = new RegExp(String.raw` ${token} `, "g");
        let count = (queryToken.join(" ").match(ptrn, "g") || []).length;
        tf_wf_q[token] = (count>0) ? (1+Math.log10(count)) : 0;
        for(let token of allTokens ){
            if(tf_wf_q[token] === undefined)
                tf_wf_q[token]=0;
        }
    });

    const weights = {};

    for(let docId in DocumentTokens) {
        weights[docId] = {};

        for(let token of allTokens) {
            weights[docId][token] = idfs[token] * tf_wf[docId][token];
        }

    }
    await fs.writeFile('7-Weights.txt', JSON.stringify(tf_wf, null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });
    const query_weights = {};
    for(let token of allTokens) {
        query_weights[token] = idfs[token] * tf_wf_q[token];
    }


    const cosine = {};

    let value_of_query =  Math.sqrt(allTokens.reduce((acc,token)=>{
        return acc+ Math.pow(query_weights[token],2);

    },0));


    for(let docId in weights){
       let scaler =  allTokens.reduce((acc,token)=>{
           //console.log(weights[docId][token],query_weights[token]);
             return (acc+ (weights[docId][token] * query_weights[token]));

        },0);

        let value_of_doc =  Math.sqrt(allTokens.reduce((acc,token)=>{
           return (acc+ Math.pow(weights[docId][token],2));

        },0));


        cosine[docId] = scaler / value_of_doc * value_of_query;



    }


    await fs.writeFile('8-query-details.txt', JSON.stringify({
        tf_weight : tf_wf_q,
        query_weights,
    }, null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });

    await fs.writeFile('9-cosines.txt', JSON.stringify(cosine, null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });



    await fs.writeFile('10-Accepted-Documents.txt', JSON.stringify(Object.keys(cosine).filter(x=>cosine[x]>0).sort((a,b)=> cosine[a] >= cosine[b] ? -1:1), null, 2), err => {
        if (err) {
            console.error(err);
        } else {
            // file written successfully
        }
    });


})();







