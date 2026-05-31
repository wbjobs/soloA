import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import logging
import os
import threading
from typing import Dict, Any, List

from solver.parameters import SimulationParams
from solver.finite_difference import FiniteDifferenceSolver
from visualization.visualizer import ResultVisualizer
from sensitivity.sensitivity_analysis import SensitivityAnalyzer
from batch.batch_runner import BatchRunner


class SimulationApp:
    def __init__(self, root):
        self.root = root
        self.root.title("地下水溶质运移数值模拟工具")
        self.root.geometry("1000x750")
        
        self.setup_logging()
        self.create_widgets()
        
    def setup_logging(self):
        os.makedirs('output', exist_ok=True)
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        self.logger = logging.getLogger(__name__)
        
    def create_widgets(self):
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill='both', expand=True, padx=10, pady=10)
        
        self.tab_single = ttk.Frame(notebook)
        self.tab_sensitivity = ttk.Frame(notebook)
        self.tab_batch = ttk.Frame(notebook)
        
        notebook.add(self.tab_single, text='单次模拟')
        notebook.add(self.tab_sensitivity, text='敏感性分析')
        notebook.add(self.tab_batch, text='批量模拟')
        
        self.create_single_tab()
        self.create_sensitivity_tab()
        self.create_batch_tab()
        
    def create_single_tab(self):
        frame = self.tab_single
        
        main_frame = ttk.Frame(frame)
        main_frame.pack(fill='both', expand=True, padx=10, pady=10)
        
        left_frame = ttk.LabelFrame(main_frame, text='模型参数')
        left_frame.pack(side='left', fill='both', expand=True, padx=5)
        
        right_frame = ttk.LabelFrame(main_frame, text='源项和边界条件')
        right_frame.pack(side='right', fill='both', expand=True, padx=5)
        
        self.single_params = {}
        
        basic_params = [
            ('model_dim', '模型维度', '1', ['1', '2']),
            ('nx', 'x方向网格数', '100', None),
            ('ny', 'y方向网格数', '50', None),
            ('Lx', 'x方向长度 (m)', '100', None),
            ('Ly', 'y方向长度 (m)', '50', None),
            ('t_total', '总时间', '50', None),
            ('dt', '时间步长', '0.1', None),
            ('output_freq', '输出频率', '10', None),
        ]
        
        physical_params = [
            ('D', '弥散系数', '1.0', None),
            ('vx', 'x方向流速', '0.5', None),
            ('vy', 'y方向流速', '0.0', None),
            ('porosity', '孔隙度', '0.3', None),
            ('retardation', '阻滞系数', '1.0', None),
            ('decay', '衰减系数', '0.0', None),
        ]
        
        source_params = [
            ('source_strength', '源强', '10.0', None),
            ('source_x', '源x位置', '10', None),
            ('source_y', '源y位置', '25', None),
            ('source_width', '源宽度', '5', None),
        ]
        
        bc_params = [
            ('C_left', '左边界浓度', '0', None),
            ('C_right', '右边界浓度', '0', None),
            ('C_top', '上边界浓度', '0', None),
            ('C_bottom', '下边界浓度', '0', None),
        ]
        
        for i, (key, label, default, options) in enumerate(basic_params):
            ttk.Label(left_frame, text=label).grid(row=i, column=0, sticky='e', padx=5, pady=2)
            if options:
                var = tk.StringVar(value=default)
                combo = ttk.Combobox(left_frame, textvariable=var, values=options, width=20)
                combo.grid(row=i, column=1, sticky='w', padx=5, pady=2)
                self.single_params[key] = var
            else:
                var = tk.StringVar(value=default)
                entry = ttk.Entry(left_frame, textvariable=var, width=23)
                entry.grid(row=i, column=1, sticky='w', padx=5, pady=2)
                self.single_params[key] = var
        
        ttk.Label(left_frame, text='').grid(row=len(basic_params), column=0)
        
        for i, (key, label, default, options) in enumerate(physical_params):
            row = len(basic_params) + 1 + i
            ttk.Label(left_frame, text=label).grid(row=row, column=0, sticky='e', padx=5, pady=2)
            var = tk.StringVar(value=default)
            entry = ttk.Entry(left_frame, textvariable=var, width=23)
            entry.grid(row=row, column=1, sticky='w', padx=5, pady=2)
            self.single_params[key] = var
        
        self.heterogeneous_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(left_frame, text='使用非均质介质', variable=self.heterogeneous_var
                       ).grid(row=len(basic_params)+len(physical_params)+1, column=0, columnspan=2, pady=5)
        
        ttk.Label(left_frame, text='随机种子').grid(row=len(basic_params)+len(physical_params)+2, column=0, sticky='e')
        self.seed_var = tk.StringVar(value='42')
        ttk.Entry(left_frame, textvariable=self.seed_var, width=23).grid(
            row=len(basic_params)+len(physical_params)+2, column=1, sticky='w', padx=5)
        
        for i, (key, label, default, options) in enumerate(source_params):
            ttk.Label(right_frame, text=label).grid(row=i, column=0, sticky='e', padx=5, pady=2)
            var = tk.StringVar(value=default)
            entry = ttk.Entry(right_frame, textvariable=var, width=23)
            entry.grid(row=i, column=1, sticky='w', padx=5, pady=2)
            self.single_params[key] = var
        
        ttk.Label(right_frame, text='').grid(row=len(source_params), column=0)
        
        for i, (key, label, default, options) in enumerate(bc_params):
            row = len(source_params) + 1 + i
            ttk.Label(right_frame, text=label).grid(row=row, column=0, sticky='e', padx=5, pady=2)
            var = tk.StringVar(value=default)
            entry = ttk.Entry(right_frame, textvariable=var, width=23)
            entry.grid(row=row, column=1, sticky='w', padx=5, pady=2)
            self.single_params[key] = var
        
        ttk.Label(right_frame, text='输出目录').grid(row=len(source_params)+len(bc_params)+1, column=0, sticky='e')
        self.single_output_var = tk.StringVar(value='output')
        ttk.Entry(right_frame, textvariable=self.single_output_var, width=23).grid(
            row=len(source_params)+len(bc_params)+1, column=1, sticky='w', padx=5)
        
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill='x', padx=10, pady=10)
        
        ttk.Button(btn_frame, text='运行模拟', command=self.run_single_simulation
                  ).pack(side='left', padx=5)
        ttk.Button(btn_frame, text='清空输出', command=self.clear_output
                  ).pack(side='left', padx=5)
        
        log_frame = ttk.LabelFrame(frame, text='运行日志')
        log_frame.pack(fill='both', expand=True, padx=10, pady=5)
        
        self.single_log = tk.Text(log_frame, height=10, width=100)
        self.single_log.pack(fill='both', expand=True, padx=5, pady=5)
        
    def create_sensitivity_tab(self):
        frame = self.tab_sensitivity
        
        param_frame = ttk.LabelFrame(frame, text='敏感性分析参数')
        param_frame.pack(fill='x', padx=10, pady=5)
        
        ttk.Label(param_frame, text='分析参数:').grid(row=0, column=0, sticky='e', padx=5, pady=5)
        self.sens_param_var = tk.StringVar(value='D')
        params = ['D', 'vx', 'vy', 'porosity', 'retardation', 'decay', 'dt', 'source_strength']
        ttk.Combobox(param_frame, textvariable=self.sens_param_var, values=params, width=15
                    ).grid(row=0, column=1, sticky='w', padx=5, pady=5)
        
        ttk.Label(param_frame, text='参数值 (逗号分隔):').grid(row=0, column=2, sticky='e', padx=5, pady=5)
        self.sens_values_var = tk.StringVar(value='0.5,1.0,2.0,5.0')
        ttk.Entry(param_frame, textvariable=self.sens_values_var, width=25
                 ).grid(row=0, column=3, sticky='w', padx=5, pady=5)
        
        ttk.Label(param_frame, text='模型维度:').grid(row=1, column=0, sticky='e', padx=5, pady=5)
        self.sens_dim_var = tk.StringVar(value='1')
        ttk.Combobox(param_frame, textvariable=self.sens_dim_var, values=['1', '2'], width=15
                    ).grid(row=1, column=1, sticky='w', padx=5, pady=5)
        
        ttk.Label(param_frame, text='基础D值:').grid(row=1, column=2, sticky='e', padx=5, pady=5)
        self.sens_D_var = tk.StringVar(value='1.0')
        ttk.Entry(param_frame, textvariable=self.sens_D_var, width=15
                 ).grid(row=1, column=3, sticky='w', padx=5, pady=5)
        
        ttk.Label(param_frame, text='基础vx:').grid(row=2, column=0, sticky='e', padx=5, pady=5)
        self.sens_vx_var = tk.StringVar(value='0.5')
        ttk.Entry(param_frame, textvariable=self.sens_vx_var, width=15
                 ).grid(row=2, column=1, sticky='w', padx=5, pady=5)
        
        ttk.Label(param_frame, text='总时间:').grid(row=2, column=2, sticky='e', padx=5, pady=5)
        self.sens_t_var = tk.StringVar(value='50')
        ttk.Entry(param_frame, textvariable=self.sens_t_var, width=15
                 ).grid(row=2, column=3, sticky='w', padx=5, pady=5)
        
        ttk.Label(param_frame, text='输出目录:').grid(row=3, column=0, sticky='e', padx=5, pady=5)
        self.sens_output_var = tk.StringVar(value='sensitivity_output')
        ttk.Entry(param_frame, textvariable=self.sens_output_var, width=15
                 ).grid(row=3, column=1, sticky='w', padx=5, pady=5)
        
        self.sens_hetero_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(param_frame, text='使用非均质介质', variable=self.sens_hetero_var
                       ).grid(row=3, column=2, columnspan=2, pady=5)
        
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill='x', padx=10, pady=10)
        
        ttk.Button(btn_frame, text='运行敏感性分析', command=self.run_sensitivity
                  ).pack(side='left', padx=5)
        
        log_frame = ttk.LabelFrame(frame, text='运行日志')
        log_frame.pack(fill='both', expand=True, padx=10, pady=5)
        
        self.sens_log = tk.Text(log_frame, height=15, width=100)
        self.sens_log.pack(fill='both', expand=True, padx=5, pady=5)
        
    def create_batch_tab(self):
        frame = self.tab_batch
        
        config_frame = ttk.LabelFrame(frame, text='批量配置')
        config_frame.pack(fill='x', padx=10, pady=5)
        
        ttk.Label(config_frame, text='配置文件:').grid(row=0, column=0, sticky='e', padx=5, pady=5)
        self.batch_config_var = tk.StringVar()
        ttk.Entry(config_frame, textvariable=self.batch_config_var, width=50
                 ).grid(row=0, column=1, sticky='w', padx=5, pady=5)
        ttk.Button(config_frame, text='浏览', command=self.browse_config
                  ).grid(row=0, column=2, padx=5, pady=5)
        
        ttk.Label(config_frame, text='输出目录:').grid(row=1, column=0, sticky='e', padx=5, pady=5)
        self.batch_output_var = tk.StringVar(value='batch_output')
        ttk.Entry(config_frame, textvariable=self.batch_output_var, width=50
                 ).grid(row=1, column=1, sticky='w', padx=5, pady=5)
        
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill='x', padx=10, pady=10)
        
        ttk.Button(btn_frame, text='创建示例配置', command=self.create_example_config
                  ).pack(side='left', padx=5)
        ttk.Button(btn_frame, text='运行批量模拟', command=self.run_batch
                  ).pack(side='left', padx=5)
        
        log_frame = ttk.LabelFrame(frame, text='运行日志')
        log_frame.pack(fill='both', expand=True, padx=10, pady=5)
        
        self.batch_log = tk.Text(log_frame, height=15, width=100)
        self.batch_log.pack(fill='both', expand=True, padx=5, pady=5)
        
    def log_message(self, widget, message):
        widget.insert(tk.END, message + '\n')
        widget.see(tk.END)
        self.root.update()
        
    def browse_config(self):
        file_path = filedialog.askopenfilename(
            title='选择配置文件',
            filetypes=[('JSON文件', '*.json'), ('CSV文件', '*.csv'), ('所有文件', '*.*')]
        )
        if file_path:
            self.batch_config_var.set(file_path)
            
    def run_single_simulation(self):
        try:
            params = SimulationParams(
                model_dim=int(self.single_params['model_dim'].get()),
                nx=int(self.single_params['nx'].get()),
                ny=int(self.single_params['ny'].get()),
                Lx=float(self.single_params['Lx'].get()),
                Ly=float(self.single_params['Ly'].get()),
                t_total=float(self.single_params['t_total'].get()),
                dt=float(self.single_params['dt'].get()),
                output_freq=int(self.single_params['output_freq'].get()),
                D=float(self.single_params['D'].get()),
                vx=float(self.single_params['vx'].get()),
                vy=float(self.single_params['vy'].get()),
                porosity=float(self.single_params['porosity'].get()),
                retardation=float(self.single_params['retardation'].get()),
                decay=float(self.single_params['decay'].get()),
                source_strength=float(self.single_params['source_strength'].get()),
                source_x=float(self.single_params['source_x'].get()),
                source_y=float(self.single_params['source_y'].get()),
                source_width=float(self.single_params['source_width'].get()),
                C_left=float(self.single_params['C_left'].get()),
                C_right=float(self.single_params['C_right'].get()),
                C_top=float(self.single_params['C_top'].get()),
                C_bottom=float(self.single_params['C_bottom'].get())
            )
            
            if self.heterogeneous_var.get():
                params.generate_heterogeneous_fields(seed=int(self.seed_var.get()))
            
            if not params.validate():
                messagebox.showerror("错误", "参数验证失败")
                return
                
            self.log_message(self.single_log, "开始模拟...")
            
            def run():
                try:
                    output_dir = self.single_output_var.get()
                    os.makedirs(output_dir, exist_ok=True)
                    
                    solver = FiniteDifferenceSolver(params)
                    
                    if params.model_dim == 1:
                        results = solver.solve_1d()
                    else:
                        results = solver.solve_2d()
                    
                    self.log_message(self.single_log, "求解完成，生成可视化结果...")
                    
                    visualizer = ResultVisualizer(results, output_dir=output_dir)
                    output_files = visualizer.generate_all_plots()
                    
                    self.log_message(self.single_log, f"完成！生成了 {len(output_files)} 个文件")
                    self.log_message(self.single_log, f"输出目录: {os.path.abspath(output_dir)}")
                    
                    messagebox.showinfo("完成", f"模拟完成！\n输出目录: {os.path.abspath(output_dir)}")
                except Exception as e:
                    self.log_message(self.single_log, f"错误: {str(e)}")
                    messagebox.showerror("错误", str(e))
            
            thread = threading.Thread(target=run)
            thread.daemon = True
            thread.start()
            
        except ValueError as e:
            messagebox.showerror("参数错误", f"请检查输入参数: {str(e)}")
            
    def clear_output(self):
        self.single_log.delete('1.0', tk.END)
        
    def run_sensitivity(self):
        try:
            params = SimulationParams(
                model_dim=int(self.sens_dim_var.get()),
                nx=100,
                ny=50,
                Lx=100.0,
                Ly=50.0,
                t_total=float(self.sens_t_var.get()),
                dt=0.1,
                output_freq=10,
                D=float(self.sens_D_var.get()),
                vx=float(self.sens_vx_var.get()),
                vy=0.0,
                source_strength=10.0,
                source_x=10.0,
                source_y=25.0,
                source_width=5.0
            )
            
            if self.sens_hetero_var.get():
                params.generate_heterogeneous_fields(seed=42)
            
            param_values = [float(v) for v in self.sens_values_var.get().split(',')]
            
            self.log_message(self.sens_log, f"开始敏感性分析: {self.sens_param_var.get()}")
            self.log_message(self.sens_log, f"参数值: {param_values}")
            
            def run():
                try:
                    output_dir = self.sens_output_var.get()
                    os.makedirs(output_dir, exist_ok=True)
                    
                    analyzer = SensitivityAnalyzer(params, output_dir=output_dir)
                    results = analyzer.run_analysis(self.sens_param_var.get(), param_values)
                    
                    self.log_message(self.sens_log, "敏感性分析完成！")
                    self.log_message(self.sens_log, f"输出目录: {os.path.abspath(output_dir)}")
                    
                    messagebox.showinfo("完成", f"敏感性分析完成！\n输出目录: {os.path.abspath(output_dir)}")
                except Exception as e:
                    self.log_message(self.sens_log, f"错误: {str(e)}")
                    messagebox.showerror("错误", str(e))
            
            thread = threading.Thread(target=run)
            thread.daemon = True
            thread.start()
            
        except ValueError as e:
            messagebox.showerror("参数错误", f"请检查输入参数: {str(e)}")
            
    def create_example_config(self):
        import json
        
        config = [
            {
                "model_dim": 1,
                "nx": 100,
                "Lx": 100.0,
                "t_total": 50.0,
                "dt": 0.1,
                "D": 1.0,
                "vx": 0.5,
                "source_strength": 10.0,
                "source_x": 10.0,
                "source_width": 5.0
            },
            {
                "model_dim": 1,
                "nx": 100,
                "Lx": 100.0,
                "t_total": 50.0,
                "dt": 0.1,
                "D": 2.0,
                "vx": 0.5,
                "source_strength": 10.0,
                "source_x": 10.0,
                "source_width": 5.0
            }
        ]
        
        file_path = filedialog.asksaveasfilename(
            title='保存示例配置',
            defaultextension='.json',
            filetypes=[('JSON文件', '*.json')]
        )
        
        if file_path:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            self.log_message(self.batch_log, f"已创建示例配置: {file_path}")
            messagebox.showinfo("完成", f"示例配置已创建: {file_path}")
            
    def run_batch(self):
        config_file = self.batch_config_var.get()
        
        if not config_file or not os.path.exists(config_file):
            messagebox.showerror("错误", "请选择有效的配置文件")
            return
            
        self.log_message(self.batch_log, f"开始批量模拟，配置文件: {config_file}")
        
        def run():
            try:
                output_dir = self.batch_output_var.get()
                os.makedirs(output_dir, exist_ok=True)
                
                runner = BatchRunner(output_dir=output_dir)
                results = runner.run_from_file(config_file)
                
                success_count = sum(1 for r in results if r['status'] == 'success')
                self.log_message(self.batch_log, f"批量模拟完成: 成功 {success_count}/{len(results)}")
                self.log_message(self.batch_log, f"输出目录: {os.path.abspath(output_dir)}")
                
                messagebox.showinfo("完成", f"批量模拟完成！\n成功: {success_count}/{len(results)}\n输出目录: {os.path.abspath(output_dir)}")
            except Exception as e:
                self.log_message(self.batch_log, f"错误: {str(e)}")
                messagebox.showerror("错误", str(e))
        
        thread = threading.Thread(target=run)
        thread.daemon = True
        thread.start()


def main():
    root = tk.Tk()
    app = SimulationApp(root)
    root.mainloop()


if __name__ == '__main__':
    main()
