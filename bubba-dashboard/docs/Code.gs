/**
 * Bubba Dashboard Database Logic
 * Code.gs - Google Apps Script
 */

const SHEET_NAME = 'Bubba_DB';

function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error("Sheet 'Bubba_DB' not found.");

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return createJsonResponse({ success: true, data: [] });

    const headers = data[0];
    const rows = data.slice(1);
    
    let result = rows.map(row => {
      let obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });

    // GET /api/status/[id]?id=123
    const targetId = e.parameter.id;
    if (targetId) {
      result = result.filter(r => r.id == targetId);
      if (result.length === 0) {
        return createJsonResponse({ error: 'User not found' }, 404);
      }
      result = result[0];
    }

    return createJsonResponse({ success: true, data: result });
  } catch (error) {
    return createJsonResponse({ success: false, error: String(error) }, 500);
  }
}

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error("Sheet 'Bubba_DB' not found.");

    // Parse incoming JSON data from Vite Frontend
    // Content-Type should be text/plain to avoid CORS preflight issues with Google Apps Script
    let requestData;
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return createJsonResponse({ error: 'Invalid JSON payload' }, 400);
    }

    const { id, status } = requestData;

    if (!id || !status) {
      return createJsonResponse({ error: 'Missing user id or status' }, 400);
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const idColIndex = headers.indexOf('id');
    const statusColIndex = headers.indexOf('status') + 1; // 1-indexed for getRange
    const lastUpdatedColIndex = headers.indexOf('last_updated') + 1;

    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idColIndex] == id) {
        // Update the cells
        sheet.getRange(i + 1, statusColIndex).setValue(status);
        sheet.getRange(i + 1, lastUpdatedColIndex).setValue(new Date().toISOString());
        found = true;
        break;
      }
    }

    if (!found) {
      return createJsonResponse({ error: 'User not found' }, 404);
    }

    return createJsonResponse({ success: true, message: 'User status successfully updated' });
  } catch (error) {
    return createJsonResponse({ success: false, error: String(error) }, 500);
  }
}

/**
 * Handles CORS Preflight OPTIONS request if necessary
 */
function doOptions(e) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Helper to wrap JSON responses
 */
function createJsonResponse(data, statusCode = 200) {
  return ContentService.createTextOutput(JSON.stringify({ ...data, status: statusCode }))
    .setMimeType(ContentService.MimeType.JSON);
}
