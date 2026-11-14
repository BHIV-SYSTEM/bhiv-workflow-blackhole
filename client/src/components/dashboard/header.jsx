// "use client"

// import { useState } from "react"
// import { Search } from "lucide-react"
// import { Button } from "../ui/button"
// import { Input } from "../ui/input"
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuLabel,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from "../ui/dropdown-menu"
// import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar"
// import { ModeToggle } from "../mode-toggle"
// import { NotificationsPopover } from "../notifications/notifications-popover"
// import { useAuth } from "../../context/auth-context"
// import { MobileMenuButton } from "../ui/mobile-menu-button"

// export function DashboardHeader({ sidebarOpen, onSidebarToggle }) {
//   const [searchQuery, setSearchQuery] = useState("")
//   const { user } = useAuth()
  

//   return (
//     <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur-lg">
//       <div className="flex h-16 items-center justify-between px-4 md:px-6">
//          {/* Mobile Menu Button */}
        
        
//           <div className="block md:hidden z-50">
//           <MobileMenuButton isOpen={sidebarOpen} onClick={onSidebarToggle} className="mr-3" />
//         </div>
        

//         <div className="relative max-w-md flex-1 hidden md:flex">
//           <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
//           <Input
//             type="search"
//             placeholder="Search tasks, departments..."
//             className="w-full pl-8"
//             value={searchQuery}
//             onChange={(e) => setSearchQuery(e.target.value)}
//           />
//         </div>

//         <div className="flex flex-1 items-center justify-end space-x-4">
//           <NotificationsPopover />
//           <ModeToggle />
//           <DropdownMenu>
//             <DropdownMenuTrigger asChild>
//               <Button variant="ghost" className="relative h-8 w-8 rounded-full">
//                 <Avatar className="h-8 w-8">
//                   <AvatarImage src="/placeholder.svg?height=32&width=32" alt="User" />
//                   <AvatarFallback>{user?.name?.charAt(0) || "U"}</AvatarFallback>
//                 </Avatar>
//               </Button>
//             </DropdownMenuTrigger>
//             <DropdownMenuContent
//               className="w-56 bg-popover/90 backdrop-blur-md border border-border shadow-xl rounded-xl"
//               align="end"
//               forceMount
//             >
//               <DropdownMenuLabel className="font-normal">
//                 <div className="flex flex-col space-y-1">
//                   <p className="text-sm font-medium leading-none">{user?.name || "User"}</p>
//                   <p className="text-xs leading-none text-muted-foreground">{user?.email || "user@example.com"}</p>
//                 </div>
//               </DropdownMenuLabel>
//               <DropdownMenuSeparator />
//               <DropdownMenuItem>Profile</DropdownMenuItem>
//               <DropdownMenuItem>Settings</DropdownMenuItem>
//               <DropdownMenuSeparator />
//               <DropdownMenuItem>Log out</DropdownMenuItem>
//             </DropdownMenuContent>
//           </DropdownMenu>
//         </div>
//       </div>
//     </header>
//   )
// }

"use client"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { SimpleModeToggle } from "../simple-mode-toggle"
import { NotificationsPopover } from "../notifications/notifications-popover"
import { useAuth } from "../../context/auth-context"
import { MobileMenuButton } from "@/components/ui/mobile-menu-button"
import { EnhancedSearch } from "./enhanced-search"
import { UserDetailsModal } from "./user-details-modal"
import { Alerts } from "../notifications/Alerts";
import { BranchSwitcher } from "../BranchSwitcher"

export function DashboardHeader({ sidebarOpen, onSidebarToggle }) {
  const navigate = useNavigate()
  const [selectedUser, setSelectedUser] = useState(null)
  const [showUserModal, setShowUserModal] = useState(false)
  const { user, logout } = useAuth()

  const handleUserSelect = (selectedUser) => {
    setSelectedUser(selectedUser)
    setShowUserModal(true)
  }

  const handleProfileClick = () => {
    navigate('/settings')
  }

  const handleSettingsClick = () => {
    navigate('/settings')
  }

  return (
    <div className="w-full h-16 border-b border-border/60 bg-card/85 backdrop-blur-md shadow-xs">
      <div className="h-full flex items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8 gap-2 sm:gap-4">
        {/* Left Spacer - Mobile Menu */}
        <div className="flex items-center flex-shrink-0 w-auto">
          <div className="md:hidden">
            <MobileMenuButton 
              isOpen={sidebarOpen} 
              onClick={onSidebarToggle} 
              className="transition-all duration-200 hover:bg-primary/10" 
            />
          </div>
        </div>

        {/* Center Section - Search Bar (Desktop) */}
        <div className="hidden md:flex flex-1 items-center justify-center min-w-0">
          <div className="w-full max-w-2xl">
            <EnhancedSearch onUserSelect={handleUserSelect} />
          </div>
        </div>

        {/* Mobile Search - Icon Only */}
        <div className="md:hidden flex-1 min-w-0">
          <EnhancedSearch onUserSelect={handleUserSelect} compact />
        </div>

        {/* Right Section - Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <BranchSwitcher />
            <NotificationsPopover />
            <Alerts />
            <SimpleModeToggle />

            {/* Enhanced User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="relative h-10 w-10 rounded-full p-0 transition-all duration-300 hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Avatar className="h-10 w-10 ring-2 ring-primary/20 hover:ring-primary/40 transition-all duration-300">
                    <AvatarImage src="/placeholder.svg?height=32&width=32" alt={user?.name || "User"} />
                    <AvatarFallback className="gradient-primary text-primary-foreground font-heading font-semibold shadow-glow-primary">
                      {user?.name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-success rounded-full border-2 border-background animate-pulse-slow"></div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64 bg-card/95 backdrop-blur-xl border border-border shadow-xl rounded-xl p-2 animate-scale-in"
                align="end"
                sideOffset={8}
                forceMount
              >
                <DropdownMenuLabel className="font-normal p-3">
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src="/placeholder.svg?height=40&width=40" alt="User" />
                        <AvatarFallback className="gradient-primary text-primary-foreground font-heading">
                          {user?.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-heading font-semibold leading-none truncate">{user?.name || "User"}</p>
                        <p className="text-xs leading-none text-muted-foreground mt-1 truncate">{user?.email || "user@example.com"}</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary mt-1.5">
                          {user?.role || "User"}
                        </span>
                      </div>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem 
                  onClick={handleProfileClick}
                  className="rounded-lg transition-all duration-200 hover:bg-primary/10 cursor-pointer py-2.5"
                >
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="font-medium">Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleSettingsClick}
                  className="rounded-lg transition-all duration-200 hover:bg-primary/10 cursor-pointer py-2.5"
                >
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-medium">Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem
                  onClick={logout}
                  className="rounded-lg transition-all duration-200 hover:bg-destructive/10 text-destructive focus:text-destructive cursor-pointer py-2.5"
                >
                  <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="font-medium">Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>

      {/* User Details Modal */}
      <UserDetailsModal
        user={selectedUser}
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
      />
    </div>
  )
}
