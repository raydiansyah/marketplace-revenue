/**
 * Module: HPP Page
 * Purpose: Halaman manajemen HPP — tabbed per marketplace dengan combined view
 * Used by: AppSidebar navigation
 * Dependencies: HppManagerTabbed, AuthAreaLayout
 * Public functions: HppPage (default export)
 * Side effects: none
 */

"use client";

import AuthAreaLayout from "@/components/AuthAreaLayout";
import HppManagerTabbed from "@/components/HppManagerTabbed";

export default function HppPage() {
	return (
		<AuthAreaLayout contentClassName="w-full px-4 py-8 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-[1320px] space-y-5">
				<div className="panel-card p-5">
					<h1 className="text-3xl font-extrabold tracking-tight text-foreground">
						Manajemen HPP
					</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Kelola data HPP per marketplace. Tab Gabungan menampilkan view
						terpadu dan deteksi konflik harga.
					</p>
				</div>

				<HppManagerTabbed />
			</div>
		</AuthAreaLayout>
	);
}
