/**
 * Module: HPP Page
 * Purpose: Halaman manajemen HPP — import master Excel, berlaku semua marketplace
 * Used by: AppSidebar navigation
 * Dependencies: HppMasterManager, AuthAreaLayout
 * Public functions: HppPage (default export)
 * Side effects: none
 */

"use client";

import AuthAreaLayout from "@/components/AuthAreaLayout";
import HppMasterManager from "@/components/HppMasterManager";

export default function HppPage() {
	return (
		<AuthAreaLayout contentClassName="w-full px-4 py-8 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-[1320px] space-y-5">
				<div className="panel-card p-5">
					<h1 className="text-3xl font-extrabold tracking-tight text-foreground">
						HPP Master
					</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Import file Excel master produk. HPP berlaku untuk semua marketplace sekaligus.
					</p>
				</div>

				<div className="panel-card p-5">
					<HppMasterManager />
				</div>
			</div>
		</AuthAreaLayout>
	);
}
