import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Signin } from './pages/signin/signin';
import { authGuard } from './guards/auth-guard';
import { Dashboard } from './pages/dashboard/dashboard';
import { Tasks } from './pages/tasks/tasks';
import { Layout } from './pages/layout/layout';
import { Users } from './pages/users/users';
import { AllTask } from './pages/alltask/alltask';
import { Profile } from './pages/profile/profile';

export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', component: Login },
    { path: 'register', component: Signin },
    {
        path: '', component: Layout, canActivate: [authGuard], children: [
            { path: 'dashboard', component: Dashboard },
            { path: 'tasks', component: Tasks },
            { path: 'users', component: Users },
            { path: 'alltask', component: AllTask },
            { path: 'profile', component: Profile },
        ]
    },
    { path: '**', redirectTo: 'login' }
];

