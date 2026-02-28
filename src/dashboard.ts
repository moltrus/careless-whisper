// @ts-nocheck
import blessed from 'blessed';
import contrib from 'blessed-contrib';

class Dashboard {
    private screen: blessed.Widgets.Screen | null = null;
    private grid: any; 
    private rttLine: any;
    private statsBox: blessed.Widgets.BoxElement | null = null;
    private logBox: blessed.Widgets.Log | null = null;

    private rttData: { x: string[], y: number[] } = { x: [], y: [] };
    private thresholdData: { x: string[], y: number[] } = { x: [], y: [] };
    private startTime: number = Date.now();
    private active: boolean = false;

    private logBuffer: string[] = [];

    constructor() {}

    public init() {
        if (this.active) return;
        this.active = true;

        this.screen = blessed.screen({
            smartCSR: true,
            title: 'Careless Whisper',
            fullUnicode: true,
        });

        this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

        this.rttLine = this.grid.set(0, 0, 8, 12, contrib.line, {
            style: {
                line: "yellow",
                text: "green",
                baseline: "black"
            },
            xLabelPadding: 3,
            xPadding: 5,
            showLegend: true,
            wholeNumbersOnly: false,
            label: 'Careless Whisper (RTT in ms)',
        });

        this.statsBox = this.grid.set(8, 0, 4, 4, blessed.box, {
            label: 'Device Status',
            tags: true,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' } }
        });

        this.logBox = this.grid.set(8, 4, 4, 8, blessed.log, {
            fg: "green",
            selectedFg: "green",
            label: 'Event Log',
            border: { type: 'line' },
            style: { border: { fg: 'green' } },
            scrollable: true,
            scrollbar: { bg: 'blue' },
            tags: true
        });

        this.screen.key(['escape', 'q', 'C-c'], function(ch, key) {
            return process.exit(0);
        });

        this.logBuffer.forEach(msg => this.logBox.log(msg));
        this.logBuffer = [];

        this.screen.render();
    }

    public isActive() {
        return this.active;
    }

    public log(message: string) {
        const time = new Date().toLocaleTimeString();
        const cleanMessage = message.replace(/\u001b\[.*?m/g, ''); 
        const formatted = `{gray-fg}[${time}]{/gray-fg} ${cleanMessage}`;

        if (this.active && this.logBox) {
            this.logBox.log(formatted);
            this.screen?.render();
        } else {
            this.logBuffer.push(formatted);
        }
    }

    public updateStats(jid: string, state: string, rtt: number, avg: number, median: number, threshold: number) {
        if (!this.active) return;

        let stateColor = '{white-fg}';
        if (state === 'Online') stateColor = '{green-fg}';
        else if (state === 'Standby') stateColor = '{yellow-fg}';
        else if (state === 'OFFLINE') stateColor = '{red-fg}';

        const content = 
            `{bold}Target:{/bold} ${jid}\n` +
            `{bold}State:{/bold}  ${stateColor}${state}{/}\n` +
            `{bold}RTT:{/bold}    ${rtt} ms\n` +
            `{bold}Avg:{/bold}    ${avg.toFixed(0)} ms\n` +
            `{bold}Thresh:{/bold} ${threshold.toFixed(0)} ms\n` +
            `{bold}Median:{/bold} ${median.toFixed(0)} ms`;

        this.statsBox?.setContent(content);
        
        const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
        
        this.rttData.x.push(timeStr);
        this.rttData.y.push(rtt);
        
        this.thresholdData.x.push(timeStr);
        this.thresholdData.y.push(threshold);

        if (this.rttData.x.length > 60) {
            this.rttData.x.shift();
            this.rttData.y.shift();
            this.thresholdData.x.shift();
            this.thresholdData.y.shift();
        }

        const series = [
            {
                title: 'RTT',
                x: this.rttData.x,
                y: this.rttData.y,
                style: { line: 'cyan' }
            },
            {
                title: 'Threshold',
                x: this.thresholdData.x,
                y: this.thresholdData.y,
                style: { line: 'red' }
            }
        ];

        this.rttLine.setData(series);
        this.screen?.render();
    }
}

export const dashboard = new Dashboard();
