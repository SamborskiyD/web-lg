const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function parseFile(filePath) {
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split('\n');
    const employees = [];
    const rates = [];
    
    let currEmployee = null;
    let currEntity = null;

    const entities = ['Employee', 'Statement', 'Department', 'Donation', 'Rate']
    
    lines.forEach(line => {
        const trimmedLine = line.trim();
        
        if (entities.includes(trimmedLine)) {
            currEntity = trimmedLine;
            if (currEntity === 'Employee') {
                if (currEmployee) employees.push(currEmployee);
                currEmployee = { salaryStatements: [], donations: [], department: {} };
            }
            if (currEntity === 'Rate') rates.push({});
            if (currEntity === 'Statement') currEmployee.salaryStatements.push({});
            if (currEntity === 'Donation') currEmployee.donations.push({});
            return;
        } 

        if (currEntity) {
            const [key, value] = trimmedLine.split(':').map(part => part.trim());
            if (!!key && !!value) {
                switch(currEntity) {
                    case 'Employee':
                        currEmployee[key] = value;
                        break;
                    case 'Department':
                        currEmployee.department[key] = value;
                        break;
                    case 'Statement':
                        const statementsLength = currEmployee.salaryStatements.length;
                        currEmployee.salaryStatements[statementsLength - 1][key] = value;
                        break;
                    case 'Donation':
                        const donationsLength = currEmployee.donations.length;
                        currEmployee.donations[donationsLength - 1][key] = value;
                        break;
                    case 'Rate':
                        rates[rates.length - 1][key] = value;
                        break;
                    default:
                        break;
                }
            }
        }
    });

    return { employees, rates };
}

const db = new sqlite3.Database('./employees.db');

db.serialize(() => {
    db.run(`
        CREATE TABLE Employee (
            id INTEGER PRIMARY KEY,
            name TEXT,
            surname TEXT
        )
    `);
    
    db.run(`
        CREATE TABLE Department (
            id INTEGER PRIMARY KEY,
            name TEXT,
            employee_id INTEGER,
            FOREIGN KEY (employee_id) REFERENCES Employee(id)
        )
    `);

    db.run(`
        CREATE TABLE SalaryStatement (
            id INTEGER PRIMARY KEY,
            amount REAL,
            date TEXT,
            employee_id INTEGER,
            FOREIGN KEY (employee_id) REFERENCES Employee(id)
        )
    `);

    db.run(`
        CREATE TABLE Donation (
            id INTEGER PRIMARY KEY,
            amount REAL,
            currency TEXT,
            date TEXT,
            employee_id INTEGER,
            FOREIGN KEY (employee_id) REFERENCES Employee(id)
        )
    `);

    db.run(`
        CREATE TABLE Rate (
            date TEXT,
            currency TEXT,
            rate REAL
        )
    `);
});

function insertToDB(db, employees, rates) {
    const insertEmployee = db.prepare(`
        INSERT INTO Employee (id, name, surname) VALUES (?, ?, ?)
    `);

    const insertDepartment = db.prepare(`
        INSERT OR IGNORE INTO Department (id, name, employee_id) VALUES (?, ?, ?)
    `);

    const insertStatement = db.prepare(`
        INSERT OR IGNORE INTO SalaryStatement (id, amount, date, employee_id) VALUES (?, ?, ?, ?)
    `);

    const insertDonation = db.prepare(`
        INSERT OR IGNORE INTO Donation (id, amount, currency, date, employee_id) VALUES (?, ?, ?, ?, ?)
    `);

    const insertRate = db.prepare(`
        INSERT OR IGNORE INTO Rate (date, currency, rate) VALUES (?, ?, ?)
    `);

    employees.forEach(employee => {
        insertEmployee.run(employee.id, employee.name, employee.surname);

        const department = employee.department;
        insertDepartment.run(department.id, department.name, employee.id);

        employee.salaryStatements.forEach(statement => {
            insertStatement.run(statement.id, statement.amount, statement.date, employee.id);
        });

        employee.donations.forEach(donation => {
            const [amount, currency] = donation.amount.split(' ');
            insertDonation.run(donation.id, parseFloat(amount), currency, donation.date, employee.id);
        });
    });

    rates.forEach(rate => {
        insertRate.run(rate.date, rate.sign, rate.value);
    });

    insertEmployee.finalize();
    insertDepartment.finalize();
    insertStatement.finalize();
    insertDonation.finalize();
    insertRate.finalize();
}

const filePath = path.join(__dirname, 'dump.txt');
const { employees, rates } = parseFile(filePath);

insertToDB(db, employees, rates);
db.close();
