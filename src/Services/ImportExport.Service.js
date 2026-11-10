const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");
const ExcelJS = require("exceljs");
const Product = require("../models/Product");
const Order = require("../models/Order");
const StockMovement = require("../models/Inventory");
const Audit = require("./Audit.Service");
const Plans = require("./Plan.Service");

const importProducts = async (buffer, organization, context) => {
    const rows = parse(buffer.toString("utf8"), { columns: true, skip_empty_lines: true, trim: true, bom: true });
    if (rows.length > 1000) throw new Error("CSV imports are limited to 1000 rows");
    const results = [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        try {
            await Plans.assertProductCreation(organization);
            const product = await Product.create({
                organization,
                name: row.name,
                price: Number(row.price),
                costPrice: Number(row.costPrice || 0),
                category: row.category,
                stock: Number(row.stock || 0),
                lowStockThreshold: Number(row.lowStockThreshold || 5),
                sku: row.sku || undefined,
                barcode: row.barcode || undefined,
                image: null
            });
            await Audit.record({ organization, ...context, action: "product.import", entity: "product", entityId: product._id, after: product });
            results.push({ row: index + 2, success: true, id: product._id });
        } catch (err) {
            results.push({ row: index + 2, success: false, errors: err.errors ? Object.values(err.errors).map((error) => error.message) : [err.message] });
        }
    }
    return { imported: results.filter((row) => row.success).length, failed: results.filter((row) => !row.success).length, results };
};

const exportData = async (type, organization, format = "csv") => {
    const config = {
        products: [Product, { organization, deletedAt: null }],
        orders: [Order, { organization, deletedAt: null }],
        movements: [StockMovement, { organization }]
    }[type];
    if (!config) throw new Error("Unsupported export type");
    const rows = await config[0].find(config[1]).sort({ createdAt: -1 }).limit(10000).lean();
    const plain = rows.map((row) => JSON.parse(JSON.stringify(row)));
    if (format === "csv") return { contentType: "text/csv", extension: "csv", body: stringify(plain, { header: true }) };
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(type);
    const keys = [...new Set(plain.flatMap((row) => Object.keys(row)))];
    sheet.columns = keys.map((key) => ({ header: key, key }));
    for (const row of plain) sheet.addRow(Object.fromEntries(keys.map((key) => [key, typeof row[key] === "object" ? JSON.stringify(row[key]) : row[key]])));
    return { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", body: Buffer.from(await workbook.xlsx.writeBuffer()) };
};
module.exports = { importProducts, exportData };
